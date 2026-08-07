import { eq } from "drizzle-orm";
import { db } from "@/db";
import { outpostVillages } from "@/db/schema";
import {
  GUILD_DINING_INGREDIENTS,
  GUILD_DINING_MENUS,
  GUILD_DINING_USER_SAVE_KEY,
  activeEffectForMenu,
  guildDiningDonationPoints,
  guildDiningIngredient,
  guildDiningMenu,
  guildDiningTicketProgress,
  parseGuildDiningUserState,
  type GuildDiningMenuId,
  type GuildDiningUserState,
} from "@/adventure/data/v2/guildDining";
import { diningHallUpgradeForLevel } from "@/adventure/data/v2/settlement";
import { ensureUser } from "@/lib/server/ensureUser";
import { isGuildAdmin } from "@/lib/server/guildAdmin";
import { logGuildActivity } from "@/lib/server/guildActivityLog";
import {
  lockGuildDiningWeekly,
  updateGuildDiningWeekly,
  type GuildDiningWeeklyRow,
} from "@/lib/server/guildDining";
import {
  lockGuildDiningIngredient,
  readGuildDiningIngredientBalances,
} from "@/lib/server/guildDiningIngredients";
import { buildingLevelFromSlots } from "@/lib/server/settlementBuildingAccess";
import { lockSaveForUpdate, readSave, upsertSave } from "@/lib/server/savesKv";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import { getGuildId } from "@/lib/server/v2EnsureSoloGuild";
import { kstWeekMondayKey } from "@/lib/kst";
import { MAX_CHARGE } from "@/lib/v2-charge-config";
import { guildExistingActivityContributionPoints } from "@/adventure/data/v2/guildContribution";
import {
  claimWeeklyFacilitySource,
  readWeeklyFacilitySource,
} from "@/lib/server/adventurerAssociation";

type InventorySave = Record<string, unknown> & {
  hpCharges?: unknown;
  mpCharges?: unknown;
};

type DiningBody = {
  action?: unknown;
  ingredientId?: unknown;
  quantity?: unknown;
  menuId?: unknown;
  menuIds?: unknown;
};

function safeCharge(value: unknown): number {
  return Math.max(0, Math.min(MAX_CHARGE, Math.floor(Number(value) || 0)));
}

async function diningHallLevel(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  guildId: number,
): Promise<number> {
  const rows = await tx
    .select({ buildings: outpostVillages.buildings })
    .from(outpostVillages)
    .where(eq(outpostVillages.guildId, guildId));
  return rows.reduce(
    (level, row) =>
      Math.max(level, buildingLevelFromSlots(row.buildings, "dining_hall")),
    0,
  );
}

async function diningView(args: {
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0];
  userId: string;
  guildId: number;
  level: number;
  weekly: GuildDiningWeeklyRow;
  now: Date;
  userState?: GuildDiningUserState;
  inventory?: InventorySave;
}) {
  const { tx, userId, guildId, level, weekly } = args;
  const [ingredientBalances, inventoryRaw, diningRaw, canManage, weeklySource] = await Promise.all([
    readGuildDiningIngredientBalances(tx, userId),
    args.inventory
      ? Promise.resolve(args.inventory)
      : readSave<InventorySave>(tx, userId, "inventory.v2", {}),
    args.userState
      ? Promise.resolve(args.userState)
      : readSave<Record<string, unknown>>(
          tx,
          userId,
          GUILD_DINING_USER_SAVE_KEY,
          {},
        ),
    isGuildAdmin(tx, guildId, userId),
    readWeeklyFacilitySource(tx, userId, "dining_hall", weekly.weekKey),
  ]);
  const inventory = inventoryRaw as InventorySave;
  const userState =
    args.userState ??
    parseGuildDiningUserState(diningRaw, {
      weekKey: weekly.weekKey,
      guildId,
      now: args.now,
    });
  const upgrade = diningHallUpgradeForLevel(level);
  const tickets = guildDiningTicketProgress(
    userState,
    upgrade.weeklyMealTickets,
  );
  const selected = new Set(weekly.selectedMenuIds);
  const activeMenu = userState.activeEffect
    ? guildDiningMenu(userState.activeEffect.menuId)
    : null;
  return {
    level,
    stageLabel: upgrade.label,
    weekKey: weekly.weekKey,
    canManage,
    eligible: weekly.eligibleUserIds.includes(userId),
    weeklySource,
    pantry: {
      points: weekly.pantryPoints,
      target: weekly.targetPoints,
      remaining: Math.max(0, weekly.targetPoints - weekly.pantryPoints),
      ready: weekly.pantryPoints >= weekly.targetPoints,
    },
    tickets,
    contributionPoints: userState.contributionPoints,
    menuSlots: upgrade.weeklyMenuSlots,
    ingredients: GUILD_DINING_INGREDIENTS.map((ingredient) => ({
      ...ingredient,
      owned: ingredientBalances[ingredient.id] ?? 0,
    })),
    menus: GUILD_DINING_MENUS.map((menu) => ({
      ...menu,
      unlocked: level >= menu.minFacilityLevel,
      selected: selected.has(menu.id),
    })),
    activeEffect: userState.activeEffect
      ? {
          ...userState.activeEffect,
          name: activeMenu?.name ?? "식사 효과",
        }
      : null,
    charges: {
      hp: safeCharge(inventory.hpCharges),
      mp: safeCharge(inventory.mpCharges),
      max: MAX_CHARGE,
    },
  };
}

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const now = new Date();
  const weekKey = kstWeekMondayKey(now);
  const result = await db.transaction(async (tx) => {
    const guildId = await getGuildId(tx, userId);
    if (guildId == null) {
      return { status: 403, body: { ok: false as const, error: "no_guild" } };
    }
    const level = await diningHallLevel(tx, guildId);
    if (level <= 0) {
      return {
        status: 403,
        body: { ok: false as const, error: "dining_hall_required" },
      };
    }
    const weekly = await lockGuildDiningWeekly(tx, guildId, weekKey);
    return {
      status: 200,
      body: {
        ok: true as const,
        ...(await diningView({ tx, userId, guildId, level, weekly, now })),
      },
    };
  });
  return Response.json(result.body, { status: result.status });
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:guild:dining-hall",
    userLimit: 30,
    ipLimit: 180,
    windowMs: 60_000,
  });
  if (limited) return limited;

  let body: DiningBody;
  try {
    body = (await req.json()) as DiningBody;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (body.action !== "select_menus" && body.action !== "donate" && body.action !== "order") {
    return Response.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const now = new Date();
  const weekKey = kstWeekMondayKey(now);
  const result = await db.transaction(async (tx) => {
    const guildId = await getGuildId(tx, userId);
    if (guildId == null) {
      return { status: 403, body: { ok: false as const, error: "no_guild" } };
    }
    const level = await diningHallLevel(tx, guildId);
    if (level <= 0) {
      return {
        status: 403,
        body: { ok: false as const, error: "dining_hall_required" },
      };
    }
    const weekly = await lockGuildDiningWeekly(tx, guildId, weekKey);
    const upgrade = diningHallUpgradeForLevel(level);

    if (body.action === "select_menus") {
      if (!(await isGuildAdmin(tx, guildId, userId))) {
        return { status: 403, body: { ok: false as const, error: "not_authorized" } };
      }
      if (weekly.pantryPoints > 0) {
        return { status: 409, body: { ok: false as const, error: "menu_locked" } };
      }
      const rawIds = Array.isArray(body.menuIds) ? body.menuIds : [];
      const menuIds = [...new Set(rawIds)].filter(
        (id): id is GuildDiningMenuId => typeof id === "string",
      );
      const menus = menuIds.map(guildDiningMenu);
      if (
        menuIds.length < 1 ||
        menuIds.length > upgrade.weeklyMenuSlots ||
        menus.some((menu) => !menu || menu.minFacilityLevel > level)
      ) {
        return { status: 400, body: { ok: false as const, error: "invalid_menus" } };
      }
      const nextWeekly = { ...weekly, selectedMenuIds: menuIds };
      await updateGuildDiningWeekly(tx, nextWeekly);
      return {
        status: 200,
        body: {
          ok: true as const,
          ...(await diningView({
            tx,
            userId,
            guildId,
            level,
            weekly: nextWeekly,
            now,
          })),
        },
      };
    }

    if (!weekly.eligibleUserIds.includes(userId)) {
      return { status: 403, body: { ok: false as const, error: "not_eligible" } };
    }

    if (body.action === "donate") {
      const ingredient = guildDiningIngredient(body.ingredientId);
      const quantity = Number(body.quantity);
      const points = ingredient
        ? guildDiningDonationPoints(ingredient, quantity)
        : null;
      if (!ingredient || points == null || quantity > 999) {
        return { status: 400, body: { ok: false as const, error: "invalid_donation" } };
      }
      const sourceInventory = await lockGuildDiningIngredient(
        tx,
        userId,
        ingredient,
        now,
      );
      if (!sourceInventory) {
        return { status: 409, body: { ok: false as const, error: "source_unavailable" } };
      }
      const diningRaw = await lockSaveForUpdate<Record<string, unknown>>(
        tx,
        userId,
        GUILD_DINING_USER_SAVE_KEY,
        {},
      );
      const userState = parseGuildDiningUserState(diningRaw, {
        weekKey,
        guildId,
        now,
      });
      const tickets = guildDiningTicketProgress(userState, upgrade.weeklyMealTickets);
      if (
        userState.contributionPoints + points > tickets.contributionCap ||
        weekly.pantryPoints + points > weekly.targetPoints
      ) {
        return { status: 409, body: { ok: false as const, error: "contribution_cap" } };
      }
      if (sourceInventory.owned < quantity) {
        return { status: 409, body: { ok: false as const, error: "insufficient_ingredients" } };
      }
      const weeklySource = await claimWeeklyFacilitySource(
        tx,
        userId,
        "dining_hall",
        "guild",
        weekKey,
      );
      if (!weeklySource.ok) {
        return {
          status: 409,
          body: {
            ok: false as const,
            error: "weekly_source_conflict",
            selectedSource: weeklySource.selected,
          },
        };
      }
      const nextUserState = {
        ...userState,
        contributionPoints: userState.contributionPoints + points,
      };
      const nextWeekly = {
        ...weekly,
        pantryPoints: weekly.pantryPoints + points,
      };
      await sourceInventory.consume(quantity);
      await upsertSave(tx, userId, GUILD_DINING_USER_SAVE_KEY, nextUserState);
      await updateGuildDiningWeekly(tx, nextWeekly);
      const contributionPoints = guildExistingActivityContributionPoints(points);
      await logGuildActivity(tx, {
        guildId,
        type: "dining_ingredient_donation",
        actorUserId: userId,
        meta: {
          itemName: ingredient.name,
          quantity,
          contributionPoints,
        },
      });
      return {
        status: 200,
        body: {
          ok: true as const,
          donated: {
            ingredientName: ingredient.name,
            quantity,
            points,
            contributionPoints,
          },
          ...(await diningView({
            tx,
            userId,
            guildId,
            level,
            weekly: nextWeekly,
            now,
            userState: nextUserState,
          })),
        },
      };
    }

    const menu = guildDiningMenu(body.menuId);
    if (!menu || !weekly.selectedMenuIds.includes(menu.id) || menu.minFacilityLevel > level) {
      return { status: 400, body: { ok: false as const, error: "menu_unavailable" } };
    }
    if (weekly.pantryPoints < weekly.targetPoints) {
      return { status: 409, body: { ok: false as const, error: "pantry_not_ready" } };
    }
    // 사냥은 inventory.v2 뒤에 식사 효과 세이브를 잠근다. 식당도 같은 순서를 지켜 데드락을 막는다.
    const inventory = await lockSaveForUpdate<InventorySave>(
      tx,
      userId,
      "inventory.v2",
      {},
    );
    const diningRaw = await lockSaveForUpdate<Record<string, unknown>>(
      tx,
      userId,
      GUILD_DINING_USER_SAVE_KEY,
      {},
    );
    const userState = parseGuildDiningUserState(diningRaw, {
      weekKey,
      guildId,
      now,
    });
    const tickets = guildDiningTicketProgress(userState, upgrade.weeklyMealTickets);
    if (tickets.available <= 0) {
      return { status: 409, body: { ok: false as const, error: "no_meal_ticket" } };
    }
    const weeklySource = await claimWeeklyFacilitySource(
      tx,
      userId,
      "dining_hall",
      "guild",
      weekKey,
    );
    if (!weeklySource.ok) {
      return {
        status: 409,
        body: {
          ok: false as const,
          error: "weekly_source_conflict",
          selectedSource: weeklySource.selected,
        },
      };
    }

    const nextInventory = { ...inventory };
    let recovery = { hp: 0, mp: 0 };
    if (menu.effect.kind === "recovery") {
      const hp = safeCharge(inventory.hpCharges);
      const mp = safeCharge(inventory.mpCharges);
      recovery = {
        hp: Math.min(menu.effect.hp, MAX_CHARGE - hp),
        mp: Math.min(menu.effect.mp, MAX_CHARGE - mp),
      };
      if (recovery.hp + recovery.mp <= 0) {
        return { status: 409, body: { ok: false as const, error: "charge_capacity" } };
      }
      nextInventory.hpCharges = hp + recovery.hp;
      nextInventory.mpCharges = mp + recovery.mp;
    }
    const nextUserState: GuildDiningUserState = {
      ...userState,
      mealsUsed: userState.mealsUsed + 1,
      activeEffect:
        menu.effect.kind === "recovery"
          ? userState.activeEffect
          : activeEffectForMenu(menu, {
              currentEffect: userState.activeEffect,
              now,
              weekKey,
            }),
    };
    if (menu.effect.kind === "recovery") {
      await upsertSave(tx, userId, "inventory.v2", nextInventory);
    }
    await upsertSave(tx, userId, GUILD_DINING_USER_SAVE_KEY, nextUserState);
    await logGuildActivity(tx, {
      guildId,
      type: "dining_meal",
      actorUserId: userId,
      meta: { itemName: menu.name },
    });
    return {
      status: 200,
      body: {
        ok: true as const,
        ordered: { menuId: menu.id, menuName: menu.name, recovery },
        ...(await diningView({
          tx,
          userId,
          guildId,
          level,
          weekly,
          now,
          userState: nextUserState,
          inventory: nextInventory,
        })),
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
