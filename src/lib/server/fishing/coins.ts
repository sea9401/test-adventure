// 낚시 보상 화폐 「낚시 코인」 — 주간 종별 대회 정산 + 일일 도전 + 챔질당 소량 적립(2026-06-27).
// 잔액은 saves_kv 의 FISHING_WALLET_KEY 에 영속(시즌 무관 누적). 사용처 = 낚시 코인 샵.

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { savesKv } from "@/db/schema";
import type { FishTier } from "@/adventure/data/v2/fish";

export const FISHING_WALLET_KEY = "fishing-wallet.v1";

// 챔질당 코인 — 티어 소량(크기 무관). 일일 상한(아래) 내에서만 적립. 다이얼(2026-06-27 사용자 결정).
export const FISHING_CATCH_COIN_BY_TIER: Record<FishTier, number> = {
  common: 3,
  uncommon: 3,
  rare: 5,
  epic: 10,
  legendary: 20,
};
// 챔질 코인 일일 상한(KST 일자 기준). 낚시는 스태미나 0(무한 캐스팅 가능)이라 트리클 상한으로 통제.
export const FISHING_CATCH_COIN_DAILY_CAP = 3000;

export type FishingWallet = {
  coins: number;
  // 챔질 코인 일일 상한 추적 — date(KST 일자)가 다르면 earned 리셋. catchDay 없으면 오늘 0.
  catchDay?: { date: string; earned: number };
};

export function walletCoins(raw: unknown): number {
  if (!raw || typeof raw !== "object") return 0;
  const v = (raw as { coins?: unknown }).coins;
  return typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
}

function walletCatchDay(raw: unknown): FishingWallet["catchDay"] | undefined {
  const cd =
    raw && typeof raw === "object"
      ? ((raw as { catchDay?: unknown }).catchDay as
          | { date?: unknown; earned?: unknown }
          | undefined)
      : undefined;
  if (!cd || typeof cd.date !== "string") return undefined;
  if (typeof cd.earned !== "number" || !Number.isFinite(cd.earned)) {
    return undefined;
  }
  return { date: cd.date, earned: Math.max(0, Math.floor(cd.earned)) };
}

export function fishingWalletWithCoins(raw: unknown, coins: number): FishingWallet {
  const next: FishingWallet = {
    coins:
      typeof coins === "number" && Number.isFinite(coins)
        ? Math.max(0, Math.floor(coins))
        : 0,
  };
  const catchDay = walletCatchDay(raw);
  if (catchDay) next.catchDay = catchDay;
  return next;
}

// 그 날 이미 챔질로 적립한 코인(일자 다르면 0). 비파괴 read.
function catchEarnedToday(raw: unknown, dayKey: string): number {
  const cd = walletCatchDay(raw);
  if (!cd || cd.date !== dayKey) return 0;
  return cd.earned;
}

// 잡은 물고기 1마리 코인 적립 — 티어값을 일일 상한 내에서 지급. 비파괴.
//   raw = 현재 지갑 세이브(잠금 read), tier = 종 티어, dayKey = kstDailyKey.
//   반환 = 저장할 다음 지갑 + 실제 지급액(awarded). 상한 도달이면 awarded 0.
export function applyCatchCoin(
  raw: unknown,
  tier: FishTier,
  dayKey: string,
  bonus: number = 0,
): { next: FishingWallet; awarded: number } {
  const coins = walletCoins(raw);
  const earnedToday = catchEarnedToday(raw, dayKey);
  const tierCoin =
    (FISHING_CATCH_COIN_BY_TIER[tier] ?? 0) +
    Math.max(0, Math.floor(Number(bonus) || 0));
  const awarded = Math.max(
    0,
    Math.min(tierCoin, FISHING_CATCH_COIN_DAILY_CAP - earnedToday),
  );
  return {
    next: {
      coins: coins + awarded,
      catchDay: { date: dayKey, earned: earnedToday + awarded },
    },
    awarded,
  };
}

// 표시용 잔액 read(잠금 없음). 차감/적립은 트랜잭션 안에서 lockSaveForUpdate 로.
export async function readFishingCoins(userId: string): Promise<number> {
  const row = (
    await db
      .select({ value: savesKv.value })
      .from(savesKv)
      .where(and(eq(savesKv.userId, userId), eq(savesKv.key, FISHING_WALLET_KEY)))
      .limit(1)
  )[0];
  return walletCoins(row?.value);
}
