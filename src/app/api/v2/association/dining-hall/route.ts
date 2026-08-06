import { db } from "@/db";
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
import {
  associationFacilityLevel,
  claimWeeklyFacilitySource,
  readWeeklyFacilitySource,
} from "@/lib/server/adventurerAssociation";
import {
  lockAssociationDiningWeekly,
  saveAssociationDiningWeekly,
  type AssociationDiningWeekly,
} from "@/lib/server/adventurerAssociationDining";
import {
  lockGuildDiningIngredient,
  readGuildDiningIngredientBalances,
} from "@/lib/server/guildDiningIngredients";
import { lockSaveForUpdate, readSave, upsertSave } from "@/lib/server/savesKv";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import { kstWeekMondayKey } from "@/lib/kst";
import { MAX_CHARGE } from "@/lib/v2-charge-config";

const ASSOCIATION_OWNER_ID = 0;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type InventorySave = Record<string, unknown> & { hpCharges?: unknown; mpCharges?: unknown };
type DiningBody = { action?: unknown; ingredientId?: unknown; quantity?: unknown; menuId?: unknown };

function safeCharge(value: unknown): number {
  return Math.max(0, Math.min(MAX_CHARGE, Math.floor(Number(value) || 0)));
}

function defaultMenus(level: number): GuildDiningMenuId[] {
  const slots = diningHallUpgradeForLevel(level).weeklyMenuSlots;
  return GUILD_DINING_MENUS.filter((menu) => menu.minFacilityLevel <= level)
    .slice(0, slots)
    .map((menu) => menu.id);
}

async function diningView(args: {
  tx: Tx;
  userId: string;
  level: number;
  weekly: AssociationDiningWeekly;
  now: Date;
  userState?: GuildDiningUserState;
  inventory?: InventorySave;
}) {
  const [balances, inventoryRaw, diningRaw, weeklySource] = await Promise.all([
    readGuildDiningIngredientBalances(args.tx, args.userId),
    args.inventory ?? readSave<InventorySave>(args.tx, args.userId, "inventory.v2", {}),
    args.userState
      ? Promise.resolve(args.userState)
      : readSave<Record<string, unknown>>(
          args.tx,
          args.userId,
          GUILD_DINING_USER_SAVE_KEY,
          {},
        ),
    readWeeklyFacilitySource(
      args.tx,
      args.userId,
      "dining_hall",
      args.weekly.weekKey,
    ),
  ]);
  const userState =
    args.userState ??
    parseGuildDiningUserState(diningRaw, {
      weekKey: args.weekly.weekKey,
      guildId: ASSOCIATION_OWNER_ID,
      now: args.now,
    });
  const upgrade = diningHallUpgradeForLevel(args.level);
  const selected = new Set(args.weekly.selectedMenuIds);
  const activeMenu = userState.activeEffect
    ? guildDiningMenu(userState.activeEffect.menuId)
    : null;
  const inventory = inventoryRaw as InventorySave;
  return {
    level: args.level,
    stageLabel: upgrade.label,
    weekKey: args.weekly.weekKey,
    weeklySource,
    canManage: false,
    eligible: weeklySource !== "guild",
    pantry: {
      points: args.weekly.pantryPoints,
      target: args.weekly.targetPoints,
      remaining: Math.max(0, args.weekly.targetPoints - args.weekly.pantryPoints),
      ready: args.weekly.pantryPoints >= args.weekly.targetPoints,
    },
    tickets: guildDiningTicketProgress(userState, upgrade.weeklyMealTickets),
    contributionPoints: userState.contributionPoints,
    menuSlots: upgrade.weeklyMenuSlots,
    ingredients: GUILD_DINING_INGREDIENTS.map((ingredient) => ({
      ...ingredient,
      owned: balances[ingredient.id] ?? 0,
    })),
    menus: GUILD_DINING_MENUS.map((menu) => ({
      ...menu,
      unlocked: args.level >= menu.minFacilityLevel,
      selected: selected.has(menu.id),
    })),
    activeEffect: userState.activeEffect
      ? { ...userState.activeEffect, name: activeMenu?.name ?? "식사 효과" }
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
  if (!userId) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const now = new Date();
  const weekKey = kstWeekMondayKey(now);
  const body = await db.transaction(async (tx) => {
    const level = await associationFacilityLevel(tx, "dining_hall");
    const weekly = await lockAssociationDiningWeekly(tx, weekKey, defaultMenus(level));
    return { ok: true as const, ...(await diningView({ tx, userId, level, weekly, now })) };
  });
  return Response.json(body);
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:association:dining-hall",
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
  if (body.action !== "donate" && body.action !== "order") {
    return Response.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const now = new Date();
  const weekKey = kstWeekMondayKey(now);
  const result = await db.transaction(async (tx) => {
    const level = await associationFacilityLevel(tx, "dining_hall");
    const weekly = await lockAssociationDiningWeekly(tx, weekKey, defaultMenus(level));
    const upgrade = diningHallUpgradeForLevel(level);

    if (body.action === "donate") {
      const ingredient = guildDiningIngredient(body.ingredientId);
      const quantity = Number(body.quantity);
      const points = ingredient ? guildDiningDonationPoints(ingredient, quantity) : null;
      if (!ingredient || points == null || quantity > 999) {
        return { status: 400, body: { ok: false as const, error: "invalid_donation" } };
      }
      const sourceInventory = await lockGuildDiningIngredient(tx, userId, ingredient, now);
      if (!sourceInventory) {
        return { status: 409, body: { ok: false as const, error: "source_unavailable" } };
      }
      const raw = await lockSaveForUpdate<Record<string, unknown>>(
        tx,
        userId,
        GUILD_DINING_USER_SAVE_KEY,
        {},
      );
      const state = parseGuildDiningUserState(raw, {
        weekKey,
        guildId: ASSOCIATION_OWNER_ID,
        now,
      });
      const tickets = guildDiningTicketProgress(state, upgrade.weeklyMealTickets);
      if (
        state.contributionPoints + points > tickets.contributionCap ||
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
        "association",
        weekKey,
      );
      if (!weeklySource.ok) {
        return {
          status: 409,
          body: { ok: false as const, error: "weekly_source_conflict", selectedSource: weeklySource.selected },
        };
      }
      const nextState = { ...state, contributionPoints: state.contributionPoints + points };
      const nextWeekly = { ...weekly, pantryPoints: weekly.pantryPoints + points };
      await sourceInventory.consume(quantity);
      await upsertSave(tx, userId, GUILD_DINING_USER_SAVE_KEY, nextState);
      await saveAssociationDiningWeekly(tx, nextWeekly);
      return {
        status: 200,
        body: {
          ok: true as const,
          donated: { ingredientName: ingredient.name, quantity, points },
          ...(await diningView({ tx, userId, level, weekly: nextWeekly, now, userState: nextState })),
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
    const inventory = await lockSaveForUpdate<InventorySave>(tx, userId, "inventory.v2", {});
    const raw = await lockSaveForUpdate<Record<string, unknown>>(
      tx,
      userId,
      GUILD_DINING_USER_SAVE_KEY,
      {},
    );
    const state = parseGuildDiningUserState(raw, {
      weekKey,
      guildId: ASSOCIATION_OWNER_ID,
      now,
    });
    if (guildDiningTicketProgress(state, upgrade.weeklyMealTickets).available <= 0) {
      return { status: 409, body: { ok: false as const, error: "no_meal_ticket" } };
    }
    const weeklySource = await claimWeeklyFacilitySource(
      tx,
      userId,
      "dining_hall",
      "association",
      weekKey,
    );
    if (!weeklySource.ok) {
      return {
        status: 409,
        body: { ok: false as const, error: "weekly_source_conflict", selectedSource: weeklySource.selected },
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
      await upsertSave(tx, userId, "inventory.v2", nextInventory);
    }
    const nextState: GuildDiningUserState = {
      ...state,
      mealsUsed: state.mealsUsed + 1,
      activeEffect:
        menu.effect.kind === "recovery"
          ? state.activeEffect
          : activeEffectForMenu(menu, { currentEffect: state.activeEffect, now, weekKey }),
    };
    await upsertSave(tx, userId, GUILD_DINING_USER_SAVE_KEY, nextState);
    return {
      status: 200,
      body: {
        ok: true as const,
        ordered: { menuId: menu.id, menuName: menu.name, recovery },
        ...(await diningView({ tx, userId, level, weekly, now, userState: nextState, inventory: nextInventory })),
      },
    };
  });
  return Response.json(result.body, { status: result.status });
}
