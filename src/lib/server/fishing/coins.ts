// 낚시 보상 화폐 「낚시 코인」 — 주간 종별 대회 정산으로만 지급(캐스팅 자체로는 안 줌 →
// 인플레 통제). 잔액은 saves_kv 의 FISHING_WALLET_KEY 에 영속(시즌 무관 누적).
// 사용처(낚시 코인 샵)는 후속 PR-6 — 이 PR 은 지급/잔액만.

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { savesKv } from "@/db/schema";

export const FISHING_WALLET_KEY = "fishing-wallet.v1";

export type FishingWallet = { coins: number };

export function walletCoins(raw: unknown): number {
  if (!raw || typeof raw !== "object") return 0;
  const v = (raw as { coins?: unknown }).coins;
  return typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
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
