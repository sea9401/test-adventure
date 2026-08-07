import { db } from "@/db";
import {
  GUILD_TRADE_SHOP_ITEMS,
  guildTradeCompletionReward,
  guildTradeItem,
  guildTradeShopItem,
  guildTradeTokenReward,
  parseGuildTradeUserState,
  type GuildTradeShopItem,
  type GuildTradeUserState,
} from "@/adventure/data/v2/guildTrade";
import { tradePostUpgradeForLevel } from "@/adventure/data/v2/settlement";
import { STAMINA_POTIONS_KEY, parseStaminaPotions } from "@/adventure/v2/staminaPotions";
import { ensureUser } from "@/lib/server/ensureUser";
import {
  associationFacilityLevel,
  canUseAdventurerAssociation,
  claimWeeklyFacilitySource,
  readWeeklyFacilitySource,
} from "@/lib/server/adventurerAssociation";
import {
  lockAssociationTradeWeekly,
  saveAssociationTradeWeekly,
  type AssociationTradeWeekly,
} from "@/lib/server/adventurerAssociationTrade";
import { lockGuildTradeItem, readGuildTradeItemBalances } from "@/lib/server/guildTradeInventory";
import { lockSaveForUpdate, readSave, upsertSave } from "@/lib/server/savesKv";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import { kstWeekMondayKey } from "@/lib/kst";

const ASSOCIATION_TRADE_SAVE_KEY = "association-trade-user.v1";
const ASSOCIATION_OWNER_ID = 0;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type TradeBody = { action?: unknown; contractId?: unknown; batches?: unknown; shopItemId?: unknown };
type AssociationTradeUserState = GuildTradeUserState & {
  contributionByContract: Record<string, number>;
  claimedCompletionIds: string[];
};

function parseAssociationTradeUserState(
  raw: unknown,
  weekKey: string,
): AssociationTradeUserState {
  const base = parseGuildTradeUserState(raw, {
    guildId: ASSOCIATION_OWNER_ID,
    weekKey,
  });
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const sameWeek = value.weekKey === weekKey && Number(value.guildId) === ASSOCIATION_OWNER_ID;
  const contributionRaw =
    sameWeek && value.contributionByContract && typeof value.contributionByContract === "object"
      ? (value.contributionByContract as Record<string, unknown>)
      : {};
  return {
    ...base,
    contributionByContract: Object.fromEntries(
      Object.entries(contributionRaw)
        .filter(([id]) => guildTradeItem(id))
        .map(([id, points]) => [id, Math.max(0, Math.floor(Number(points) || 0))]),
    ),
    claimedCompletionIds:
      sameWeek && Array.isArray(value.claimedCompletionIds)
        ? [...new Set(value.claimedCompletionIds.filter((id): id is string => typeof id === "string"))]
        : [],
  };
}

async function lockUserState(
  tx: Tx,
  userId: string,
  weekKey: string,
): Promise<AssociationTradeUserState> {
  const raw = await lockSaveForUpdate<Record<string, unknown>>(
    tx,
    userId,
    ASSOCIATION_TRADE_SAVE_KEY,
    {},
  );
  return parseAssociationTradeUserState(raw, weekKey);
}

async function tradeView(args: {
  tx: Tx;
  userId: string;
  level: number;
  weekly: AssociationTradeWeekly;
  now: Date;
  userState: AssociationTradeUserState;
}) {
  const upgrade = tradePostUpgradeForLevel(args.level);
  const items = args.weekly.contractIds
    .map(guildTradeItem)
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const balances = await readGuildTradeItemBalances(args.tx, args.userId, items, args.now);
  const weeklySource = await readWeeklyFacilitySource(
    args.tx,
    args.userId,
    "trade_post",
    args.weekly.weekKey,
  );
  const personalRemaining = Math.max(
    0,
    upgrade.personalContributionCap - args.userState.contributionPoints,
  );
  const reward = guildTradeCompletionReward(upgrade.completionRewardBonusPct);
  const completionTokenReward = Math.floor(
    (10 * (100 + upgrade.completionRewardBonusPct)) / 100,
  );
  return {
    level: args.level,
    stageLabel: upgrade.label,
    weekKey: args.weekly.weekKey,
    weeklySource,
    eligible: weeklySource !== "guild",
    isMaster: false,
    memberPurchasesEnabled: true,
    canPurchase: true,
    rewardBonusPct: upgrade.completionRewardBonusPct,
    tokenYieldBonusPct: upgrade.tokenYieldBonusPct,
    contribution: {
      points: args.userState.contributionPoints,
      cap: upgrade.personalContributionCap,
      remaining: personalRemaining,
    },
    tokens: args.userState.tokens,
    claimableRewards: args.weekly.completedIds.flatMap((contractId) => {
      if (
        (args.userState.contributionByContract[contractId] ?? 0) <= 0 ||
        args.userState.claimedCompletionIds.includes(contractId)
      ) {
        return [];
      }
      const item = guildTradeItem(contractId);
      return item
        ? [{ contractId, itemName: item.name, tokens: completionTokenReward }]
        : [];
    }),
    contracts: items.map((item) => {
      const progress = Math.min(args.weekly.target, args.weekly.progress[item.id] ?? 0);
      const remainingPoints = Math.max(0, args.weekly.target - progress);
      const owned = balances[item.id] ?? 0;
      return {
        ...item,
        progress,
        target: args.weekly.target,
        remainingPoints,
        completed: args.weekly.completedIds.includes(item.id),
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
      const purchased = args.userState.purchases[item.id] ?? 0;
      return {
        ...item,
        unlocked: args.level >= item.minFacilityLevel,
        purchased,
        remaining: Math.max(0, item.weeklyLimit - purchased),
        affordable: args.userState.tokens >= item.tokenCost,
      };
    }),
  };
}

export async function GET() {
  const userId = await ensureUser();
  if (!userId) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!(await canUseAdventurerAssociation(db, userId))) {
    return Response.json(
      { ok: false, error: "association_for_solo_only" },
      { status: 403 },
    );
  }
  const now = new Date();
  const weekKey = kstWeekMondayKey(now);
  const body = await db.transaction(async (tx) => {
    const level = await associationFacilityLevel(tx, "trade_post");
    const upgrade = tradePostUpgradeForLevel(level);
    const weekly = await lockAssociationTradeWeekly(tx, weekKey, upgrade.weeklyContractCount);
    const raw = await readSave<Record<string, unknown>>(
      tx,
      userId,
      ASSOCIATION_TRADE_SAVE_KEY,
      {},
    );
    const userState = parseAssociationTradeUserState(raw, weekKey);
    return { ok: true as const, ...(await tradeView({ tx, userId, level, weekly, now, userState })) };
  });
  return Response.json(body);
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!(await canUseAdventurerAssociation(db, userId))) {
    return Response.json(
      { ok: false, error: "association_for_solo_only" },
      { status: 403 },
    );
  }
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:association:trade-post",
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
  if (body.action !== "deliver" && body.action !== "buy" && body.action !== "claim_rewards") {
    return Response.json({ ok: false, error: "invalid_action" }, { status: 400 });
  }
  const now = new Date();
  const weekKey = kstWeekMondayKey(now);
  const result = await db.transaction(async (tx) => {
    const level = await associationFacilityLevel(tx, "trade_post");
    const upgrade = tradePostUpgradeForLevel(level);
    const weekly = await lockAssociationTradeWeekly(tx, weekKey, upgrade.weeklyContractCount);
    const userState = await lockUserState(tx, userId, weekKey);

    if (body.action === "claim_rewards") {
      const claimableIds = weekly.completedIds.filter(
        (contractId) =>
          (userState.contributionByContract[contractId] ?? 0) > 0 &&
          !userState.claimedCompletionIds.includes(contractId),
      );
      if (claimableIds.length === 0) {
        return { status: 409, body: { ok: false as const, error: "no_claimable_reward" } };
      }
      const weeklySource = await claimWeeklyFacilitySource(
        tx,
        userId,
        "trade_post",
        "association",
        weekKey,
      );
      if (!weeklySource.ok) {
        return { status: 409, body: { ok: false as const, error: "weekly_source_conflict", selectedSource: weeklySource.selected } };
      }
      const each = Math.floor((10 * (100 + upgrade.completionRewardBonusPct)) / 100);
      const tokensGained = each * claimableIds.length;
      const nextUserState = {
        ...userState,
        tokens: userState.tokens + tokensGained,
        claimedCompletionIds: [...userState.claimedCompletionIds, ...claimableIds],
      };
      await upsertSave(tx, userId, ASSOCIATION_TRADE_SAVE_KEY, nextUserState);
      return {
        status: 200,
        body: {
          ok: true as const,
          completionReward: { contracts: claimableIds.length, tokensGained },
          ...(await tradeView({ tx, userId, level, weekly, now, userState: nextUserState })),
        },
      };
    }

    if (body.action === "deliver") {
      const item = guildTradeItem(body.contractId);
      const batches = Math.floor(Number(body.batches));
      if (!item || !weekly.contractIds.includes(item.id) || !Number.isFinite(batches) || batches < 1 || batches > 999) {
        return { status: 400, body: { ok: false as const, error: "invalid_delivery" } };
      }
      if (weekly.completedIds.includes(item.id)) {
        return { status: 409, body: { ok: false as const, error: "contract_complete" } };
      }
      const source = await lockGuildTradeItem(tx, userId, item, now);
      if (!source) return { status: 409, body: { ok: false as const, error: "source_unavailable" } };
      const quantity = item.batchSize * batches;
      const points = item.pointValue * batches;
      if (userState.contributionPoints + points > upgrade.personalContributionCap) {
        return { status: 409, body: { ok: false as const, error: "contribution_cap" } };
      }
      if (source.owned < quantity) {
        return { status: 409, body: { ok: false as const, error: "insufficient_items" } };
      }
      const weeklySource = await claimWeeklyFacilitySource(
        tx,
        userId,
        "trade_post",
        "association",
        weekKey,
      );
      if (!weeklySource.ok) {
        return { status: 409, body: { ok: false as const, error: "weekly_source_conflict", selectedSource: weeklySource.selected } };
      }
      const tokensGained = guildTradeTokenReward(
        userState.contributionPoints,
        points,
        upgrade.tokenYieldBonusPct,
      );
      const currentProgress = weekly.progress[item.id] ?? 0;
      const completed = currentProgress + points >= weekly.target;
      const nextWeekly = {
        ...weekly,
        progress: { ...weekly.progress, [item.id]: Math.min(weekly.target, currentProgress + points) },
        completedIds: completed ? [...weekly.completedIds, item.id] : weekly.completedIds,
      };
      const nextUserState = {
        ...userState,
        tokens: userState.tokens + tokensGained,
        contributionPoints: userState.contributionPoints + points,
        contributionByContract: {
          ...userState.contributionByContract,
          [item.id]: (userState.contributionByContract[item.id] ?? 0) + points,
        },
      };
      await source.consume(quantity);
      await upsertSave(tx, userId, ASSOCIATION_TRADE_SAVE_KEY, nextUserState);
      await saveAssociationTradeWeekly(tx, nextWeekly);
      return {
        status: 200,
        body: {
          ok: true as const,
          delivered: { itemName: item.name, quantity, points, tokensGained, completed },
          guildReward: null,
          ...(await tradeView({ tx, userId, level, weekly: nextWeekly, now, userState: nextUserState })),
        },
      };
    }

    const item = guildTradeShopItem(body.shopItemId);
    if (!item) return { status: 400, body: { ok: false as const, error: "invalid_shop_item" } };
    if (level < item.minFacilityLevel) return { status: 403, body: { ok: false as const, error: "shop_item_locked" } };
    if ((userState.purchases[item.id] ?? 0) >= item.weeklyLimit) {
      return { status: 409, body: { ok: false as const, error: "purchase_limit" } };
    }
    if (userState.tokens < item.tokenCost) {
      return { status: 409, body: { ok: false as const, error: "insufficient_tokens" } };
    }
    const grant = await lockShopGrant(tx, userId, item);
    const weeklySource = await claimWeeklyFacilitySource(
      tx,
      userId,
      "trade_post",
      "association",
      weekKey,
    );
    if (!weeklySource.ok) {
      return { status: 409, body: { ok: false as const, error: "weekly_source_conflict", selectedSource: weeklySource.selected } };
    }
    const nextUserState = {
      ...userState,
      tokens: userState.tokens - item.tokenCost,
      purchases: {
        ...userState.purchases,
        [item.id]: (userState.purchases[item.id] ?? 0) + 1,
      },
    };
    await grant();
    await upsertSave(tx, userId, ASSOCIATION_TRADE_SAVE_KEY, nextUserState);
    return {
      status: 200,
      body: {
        ok: true as const,
        purchased: {
          itemId: item.id,
          itemName: item.name,
          quantity: item.output.count,
          tokenCost: item.tokenCost,
          remainingTokens: nextUserState.tokens,
        },
        ...(await tradeView({ tx, userId, level, weekly, now, userState: nextUserState })),
      },
    };
  });
  return Response.json(result.body, { status: result.status });
}

async function lockShopGrant(tx: Tx, userId: string, item: GuildTradeShopItem): Promise<() => Promise<void>> {
  const output = item.output;
  if (output.kind === "material") {
    const char = await lockSaveForUpdate<Record<string, unknown>>(tx, userId, "character.v2", {});
    const materials = char.materials && typeof char.materials === "object"
      ? { ...(char.materials as Record<string, unknown>) }
      : {};
    materials[output.materialId] = Math.max(0, Math.floor(Number(materials[output.materialId]) || 0)) + output.count;
    return () => upsertSave(tx, userId, "character.v2", { ...char, materials });
  }
  if (output.kind === "stamina_potion") {
    const raw = await lockSaveForUpdate(tx, userId, STAMINA_POTIONS_KEY, {});
    const count = parseStaminaPotions(raw).count;
    return () => upsertSave(tx, userId, STAMINA_POTIONS_KEY, { count: count + output.count });
  }
  const inventory = await lockSaveForUpdate<Record<string, unknown>>(tx, userId, "inventory.v2", {});
  const count = Math.max(0, Math.floor(Number(inventory[output.itemKey]) || 0));
  return () => upsertSave(tx, userId, "inventory.v2", { ...inventory, [output.itemKey]: count + output.count });
}
