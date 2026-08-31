import { eq } from "drizzle-orm";
import { db } from "@/db";
import { guildMembers, guildTradeWeekly } from "@/db/schema";
import {
  GUILD_TRADE_SHOP_ITEMS,
  guildTradeContractTarget,
  guildTradeItem,
  guildTradeItemsForWeek,
} from "@/adventure/data/v2/guildTrade";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type GuildTradeWeeklyState = {
  guildId: number;
  weekKey: string;
  contractIds: string[];
  progress: Record<string, number>;
  completedIds: string[];
  eligibleUserIds: string[];
  target: number;
  /** 주차가 바뀌어도 유지되는 길드 공동 교역 토큰. */
  tokens: number;
  /** 이번 주 길드 전체의 교역소 품목별 구매 횟수. */
  purchases: Record<string, number>;
  /** 이전 구매 권한 정책 호환용. 신규 로직에서는 사용하지 않는다. */
  memberPurchasesEnabled: boolean;
};

function stringList(raw: unknown): string[] {
  return Array.isArray(raw)
    ? [...new Set(raw.filter((value): value is string => typeof value === "string"))]
    : [];
}

function progressRecord(raw: unknown, contractIds: readonly string[]) {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return Object.fromEntries(
    contractIds.map((id) => [id, Math.max(0, Math.floor(Number(value[id]) || 0))]),
  );
}

function nonNegativeInt(raw: unknown): number {
  return Math.max(0, Math.floor(Number(raw) || 0));
}

async function memberIds(tx: Tx, guildId: number): Promise<string[]> {
  const rows = await tx
    .select({ userId: guildMembers.userId })
    .from(guildMembers)
    .where(eq(guildMembers.guildId, guildId));
  return rows.map((row) => row.userId);
}

function freshState(args: {
  guildId: number;
  weekKey: string;
  contractCount: number;
  eligibleUserIds: string[];
}): GuildTradeWeeklyState {
  const contractIds = guildTradeItemsForWeek(
    args.weekKey,
    args.guildId,
    args.contractCount,
  ).map((item) => item.id);
  return {
    guildId: args.guildId,
    weekKey: args.weekKey,
    contractIds,
    progress: Object.fromEntries(contractIds.map((id) => [id, 0])),
    completedIds: [],
    eligibleUserIds: args.eligibleUserIds,
    target: guildTradeContractTarget(args.eligibleUserIds.length),
    tokens: 0,
    purchases: {},
    memberPurchasesEnabled: true,
  };
}

function rowState(
  row: {
    weekKey: string;
    contractIds: unknown;
    progress: unknown;
    completedIds: unknown;
    eligibleUserIds: unknown;
    tokens: unknown;
    purchases: unknown;
    memberPurchasesEnabled: unknown;
  },
  guildId: number,
): GuildTradeWeeklyState | null {
  const contractIds = stringList(row.contractIds).filter((id) => guildTradeItem(id));
  if (contractIds.length === 0) return null;
  const eligibleUserIds = stringList(row.eligibleUserIds);
  return {
    guildId,
    weekKey: row.weekKey,
    contractIds,
    progress: progressRecord(row.progress, contractIds),
    completedIds: stringList(row.completedIds).filter((id) => contractIds.includes(id)),
    eligibleUserIds,
    target: guildTradeContractTarget(eligibleUserIds.length),
    tokens: nonNegativeInt(row.tokens),
    purchases: progressRecord(row.purchases, GUILD_TRADE_SHOP_ITEMS.map((item) => item.id)),
    memberPurchasesEnabled: row.memberPurchasesEnabled !== false,
  };
}

export async function lockGuildTradeWeekly(
  tx: Tx,
  guildId: number,
  weekKey: string,
  contractCount: number,
): Promise<GuildTradeWeeklyState> {
  const eligibleUserIds = await memberIds(tx, guildId);
  const fresh = freshState({ guildId, weekKey, contractCount, eligibleUserIds });
  await tx
    .insert(guildTradeWeekly)
    .values({
      guildId,
      weekKey,
      contractIds: fresh.contractIds,
      progress: fresh.progress,
      completedIds: [],
      eligibleUserIds,
    })
    .onConflictDoNothing();

  const row = (
    await tx
      .select()
      .from(guildTradeWeekly)
      .where(eq(guildTradeWeekly.guildId, guildId))
      .for("update")
      .limit(1)
  )[0];
  const parsed = row ? rowState(row, guildId) : null;
  if (!parsed || row.weekKey !== weekKey) {
    const reset = {
      ...fresh,
      tokens: nonNegativeInt(row?.tokens),
      purchases: {},
      memberPurchasesEnabled: row?.memberPurchasesEnabled !== false,
    };
    await saveGuildTradeWeekly(tx, reset);
    return reset;
  }
  return parsed;
}

export async function saveGuildTradeWeekly(
  tx: Tx,
  state: GuildTradeWeeklyState,
): Promise<void> {
  await tx
    .insert(guildTradeWeekly)
    .values({
      guildId: state.guildId,
      weekKey: state.weekKey,
      contractIds: state.contractIds,
      progress: state.progress,
      completedIds: state.completedIds,
      eligibleUserIds: state.eligibleUserIds,
      tokens: state.tokens,
      purchases: state.purchases,
      memberPurchasesEnabled: state.memberPurchasesEnabled,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: guildTradeWeekly.guildId,
      set: {
        weekKey: state.weekKey,
        contractIds: state.contractIds,
        progress: state.progress,
        completedIds: state.completedIds,
        eligibleUserIds: state.eligibleUserIds,
        tokens: state.tokens,
        purchases: state.purchases,
        memberPurchasesEnabled: state.memberPurchasesEnabled,
        updatedAt: new Date(),
      },
    });
}
