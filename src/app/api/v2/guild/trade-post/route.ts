import { eq } from "drizzle-orm";
import { db } from "@/db";
import { outpostVillages } from "@/db/schema";
import {
  GUILD_TRADE_SHOP_ITEMS,
  GUILD_TRADE_USER_SAVE_KEY,
  guildTradeCompletionReward,
  guildTradeItem,
  guildTradeShopItem,
  parseGuildTradeUserState,
  type GuildTradeShopItem,
  type GuildTradeUserState,
} from "@/adventure/data/v2/guildTrade";
import { tradePostUpgradeForLevel } from "@/adventure/data/v2/settlement";
import { STAMINA_POTIONS_KEY, parseStaminaPotions } from "@/adventure/v2/staminaPotions";
import { ensureUser } from "@/lib/server/ensureUser";
import { logGuildActivity } from "@/lib/server/guildActivityLog";
import {
  lockGuildTradeWeekly,
  saveGuildTradeWeekly,
  type GuildTradeWeeklyState,
} from "@/lib/server/guildTrade";
import {
  lockGuildTradeItem,
  readGuildTradeItemBalances,
} from "@/lib/server/guildTradeInventory";
import { buildingLevelFromSlots } from "@/lib/server/settlementBuildingAccess";
import { lockSaveForUpdate, readSave, upsertSave } from "@/lib/server/savesKv";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import { addGuildFame } from "@/lib/server/v2GuildFame";
import {
  lockGuildResources,
  upsertGuildResources,
} from "@/lib/server/v2GuildResources";
import { getGuildId } from "@/lib/server/v2EnsureSoloGuild";
import { kstWeekMondayKey } from "@/lib/kst";

type TradeBody = {
  action?: unknown;
  contractId?: unknown;
  batches?: unknown;
  shopItemId?: unknown;
};

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function tradePostLevel(tx: Tx, guildId: number): Promise<number> {
  const rows = await tx
    .select({ buildings: outpostVillages.buildings })
    .from(outpostVillages)
    .where(eq(outpostVillages.guildId, guildId));
  return rows.reduce(
    (level, row) =>
      Math.max(level, buildingLevelFromSlots(row.buildings, "trade_post")),
    0,
  );
}

async function tradeView(args: {
  tx: Tx;
  userId: string;
  guildId: number;
  level: number;
  weekly: GuildTradeWeeklyState;
  now: Date;
  userState?: GuildTradeUserState;
}) {
  const { tx, userId, guildId, level, weekly, now } = args;
  const upgrade = tradePostUpgradeForLevel(level);
  const items = weekly.contractIds
    .map(guildTradeItem)
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const [balances, userRaw] = await Promise.all([
    readGuildTradeItemBalances(tx, userId, items, now),
    args.userState
      ? Promise.resolve(args.userState)
      : readSave<Record<string, unknown>>(
          tx,
          userId,
          GUILD_TRADE_USER_SAVE_KEY,
          {},
        ),
  ]);
  const userState =
    args.userState ??
    parseGuildTradeUserState(userRaw, { guildId, weekKey: weekly.weekKey });
  const reward = guildTradeCompletionReward(
    upgrade.completionRewardBonusPct,
  );
  const personalRemaining = Math.max(
    0,
    upgrade.personalContributionCap - userState.contributionPoints,
  );

  return {
    level,
    stageLabel: upgrade.label,
    weekKey: weekly.weekKey,
    eligible: weekly.eligibleUserIds.includes(userId),
    rewardBonusPct: upgrade.completionRewardBonusPct,
    contribution: {
      points: userState.contributionPoints,
      cap: upgrade.personalContributionCap,
      remaining: personalRemaining,
    },
    tokens: userState.tokens,
    contracts: items.map((item) => {
      const progress = Math.min(weekly.target, weekly.progress[item.id] ?? 0);
      const remainingPoints = Math.max(0, weekly.target - progress);
      const owned = balances[item.id] ?? 0;
      return {
        ...item,
        progress,
        target: weekly.target,
        remainingPoints,
        completed: weekly.completedIds.includes(item.id),
        owned,
        maxBatches: Math.max(
          0,
          Math.min(
            Math.floor(owned / item.batchSize),
            Math.ceil(remainingPoints / item.pointValue),
            Math.floor(personalRemaining / item.pointValue),
          ),
        ),
        reward,
      };
    }),
    shop: GUILD_TRADE_SHOP_ITEMS.map((item) => {
      const purchased = userState.purchases[item.id] ?? 0;
      return {
        ...item,
        unlocked: level >= item.minFacilityLevel,
        purchased,
        remaining: Math.max(0, item.weeklyLimit - purchased),
        affordable: userState.tokens >= item.tokenCost,
      };
    }),
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
    const level = await tradePostLevel(tx, guildId);
    if (level <= 0) {
      return {
        status: 403,
        body: { ok: false as const, error: "trade_post_required" },
      };
    }
    const upgrade = tradePostUpgradeForLevel(level);
    const weekly = await lockGuildTradeWeekly(
      tx,
      guildId,
      weekKey,
      upgrade.weeklyContractCount,
    );
    return {
      status: 200,
      body: {
        ok: true as const,
        ...(await tradeView({ tx, userId, guildId, level, weekly, now })),
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
    action: "v2:guild:trade-post",
    userLimit: 40,
    ipLimit: 200,
    windowMs: 60_000,
  });
  if (limited) return limited;

  let body: TradeBody;
  try {
    body = (await req.json()) as TradeBody;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (body.action !== "deliver" && body.action !== "buy") {
    return Response.json({ ok: false, error: "invalid_action" }, { status: 400 });
  }

  const now = new Date();
  const weekKey = kstWeekMondayKey(now);
  const result = await db.transaction(async (tx) => {
    const guildId = await getGuildId(tx, userId);
    if (guildId == null) {
      return { status: 403, body: { ok: false as const, error: "no_guild" } };
    }
    const level = await tradePostLevel(tx, guildId);
    if (level <= 0) {
      return {
        status: 403,
        body: { ok: false as const, error: "trade_post_required" },
      };
    }
    const upgrade = tradePostUpgradeForLevel(level);
    const weekly = await lockGuildTradeWeekly(
      tx,
      guildId,
      weekKey,
      upgrade.weeklyContractCount,
    );

    if (body.action === "deliver") {
      if (!weekly.eligibleUserIds.includes(userId)) {
        return { status: 403, body: { ok: false as const, error: "not_eligible" } };
      }
      const item = guildTradeItem(body.contractId);
      const batches = Math.floor(Number(body.batches));
      if (
        !item ||
        !weekly.contractIds.includes(item.id) ||
        !Number.isFinite(batches) ||
        batches < 1 ||
        batches > 999
      ) {
        return { status: 400, body: { ok: false as const, error: "invalid_delivery" } };
      }
      if (weekly.completedIds.includes(item.id)) {
        return { status: 409, body: { ok: false as const, error: "contract_complete" } };
      }

      const source = await lockGuildTradeItem(tx, userId, item, now);
      if (!source) {
        return { status: 409, body: { ok: false as const, error: "source_unavailable" } };
      }
      const userRaw = await lockSaveForUpdate<Record<string, unknown>>(
        tx,
        userId,
        GUILD_TRADE_USER_SAVE_KEY,
        {},
      );
      const userState = parseGuildTradeUserState(userRaw, { guildId, weekKey });
      const quantity = item.batchSize * batches;
      const points = item.pointValue * batches;
      const currentProgress = weekly.progress[item.id] ?? 0;
      if (
        userState.contributionPoints + points > upgrade.personalContributionCap
      ) {
        return { status: 409, body: { ok: false as const, error: "contribution_cap" } };
      }
      if (source.owned < quantity) {
        return { status: 409, body: { ok: false as const, error: "insufficient_items" } };
      }

      const completed = currentProgress + points >= weekly.target;
      const nextWeekly: GuildTradeWeeklyState = {
        ...weekly,
        progress: {
          ...weekly.progress,
          [item.id]: Math.min(weekly.target, currentProgress + points),
        },
        completedIds: completed
          ? [...weekly.completedIds, item.id]
          : weekly.completedIds,
      };
      const nextUserState: GuildTradeUserState = {
        ...userState,
        tokens: userState.tokens + points,
        contributionPoints: userState.contributionPoints + points,
      };
      await source.consume(quantity);
      await upsertSave(tx, userId, GUILD_TRADE_USER_SAVE_KEY, nextUserState);
      await saveGuildTradeWeekly(tx, nextWeekly);

      let guildReward: { gold: number; fame: number } | null = null;
      if (completed) {
        guildReward = guildTradeCompletionReward(
          upgrade.completionRewardBonusPct,
        );
        const resources = await lockGuildResources(tx, guildId);
        await upsertGuildResources(tx, guildId, {
          gold: resources.gold + guildReward.gold,
        });
        await addGuildFame(tx, guildId, guildReward.fame);
        await logGuildActivity(tx, {
          guildId,
          type: "trade_contract_complete",
          actorUserId: userId,
          meta: {
            itemName: item.name,
            rewardGold: guildReward.gold,
            rewardFame: guildReward.fame,
          },
        });
      }

      return {
        status: 200,
        body: {
          ok: true as const,
          delivered: { itemName: item.name, quantity, points, completed },
          guildReward,
          ...(await tradeView({
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

    const shopItem = guildTradeShopItem(body.shopItemId);
    if (!shopItem) {
      return { status: 400, body: { ok: false as const, error: "invalid_shop_item" } };
    }
    if (level < shopItem.minFacilityLevel) {
      return { status: 403, body: { ok: false as const, error: "shop_item_locked" } };
    }
    const grant = await lockShopGrant(tx, userId, shopItem);
    const userRaw = await lockSaveForUpdate<Record<string, unknown>>(
      tx,
      userId,
      GUILD_TRADE_USER_SAVE_KEY,
      {},
    );
    const userState = parseGuildTradeUserState(userRaw, { guildId, weekKey });
    if ((userState.purchases[shopItem.id] ?? 0) >= shopItem.weeklyLimit) {
      return { status: 409, body: { ok: false as const, error: "purchase_limit" } };
    }
    if (userState.tokens < shopItem.tokenCost) {
      return { status: 409, body: { ok: false as const, error: "insufficient_tokens" } };
    }
    const nextUserState: GuildTradeUserState = {
      ...userState,
      tokens: userState.tokens - shopItem.tokenCost,
      purchases: {
        ...userState.purchases,
        [shopItem.id]: (userState.purchases[shopItem.id] ?? 0) + 1,
      },
    };
    await grant();
    await upsertSave(tx, userId, GUILD_TRADE_USER_SAVE_KEY, nextUserState);
    return {
      status: 200,
      body: {
        ok: true as const,
        purchased: { itemId: shopItem.id, itemName: shopItem.name },
        ...(await tradeView({
          tx,
          userId,
          guildId,
          level,
          weekly,
          now,
          userState: nextUserState,
        })),
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}

async function lockShopGrant(
  tx: Tx,
  userId: string,
  item: GuildTradeShopItem,
): Promise<() => Promise<void>> {
  const output = item.output;
  if (output.kind === "material") {
    const char = await lockSaveForUpdate<Record<string, unknown>>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const materials =
      char.materials && typeof char.materials === "object"
        ? { ...(char.materials as Record<string, unknown>) }
        : {};
    const current = Math.max(
      0,
      Math.floor(Number(materials[output.materialId]) || 0),
    );
    materials[output.materialId] = current + output.count;
    return () =>
      upsertSave(tx, userId, "character.v2", { ...char, materials });
  }
  if (output.kind === "stamina_potion") {
    const raw = await lockSaveForUpdate(
      tx,
      userId,
      STAMINA_POTIONS_KEY,
      {},
    );
    const current = parseStaminaPotions(raw).count;
    return () =>
      upsertSave(tx, userId, STAMINA_POTIONS_KEY, {
        count: current + output.count,
      });
  }
  const inventory = await lockSaveForUpdate<Record<string, unknown>>(
    tx,
    userId,
    "inventory.v2",
    {},
  );
  const current = Math.max(
    0,
    Math.floor(Number(inventory[output.itemKey]) || 0),
  );
  return () =>
    upsertSave(tx, userId, "inventory.v2", {
      ...inventory,
      [output.itemKey]: current + output.count,
    });
}
