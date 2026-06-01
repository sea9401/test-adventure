// 발굴 보상 화폐 「발굴 코인」 — 감정사 분해(중복/흔함 골동품 → 코인)로 지급. 잔액은
// saves_kv 의 TREASURE_WALLET_KEY 에 영속. 사용처(발굴 코인 샵)는 칭호 구매.
//
// fishing-wallet.v1 패턴 미러. 차감/적립은 트랜잭션 안에서 lockSaveForUpdate 로.

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { savesKv } from "@/db/schema";

export const TREASURE_WALLET_KEY = "treasure-wallet.v1";

export type TreasureWallet = { coins: number };

export function walletCoins(raw: unknown): number {
  if (!raw || typeof raw !== "object") return 0;
  const v = (raw as { coins?: unknown }).coins;
  return typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
}

// 표시용 잔액 read(잠금 없음). 차감/적립은 트랜잭션 안에서 lockSaveForUpdate 로.
export async function readTreasureCoins(userId: string): Promise<number> {
  const row = (
    await db
      .select({ value: savesKv.value })
      .from(savesKv)
      .where(and(eq(savesKv.userId, userId), eq(savesKv.key, TREASURE_WALLET_KEY)))
      .limit(1)
  )[0];
  return walletCoins(row?.value);
}
