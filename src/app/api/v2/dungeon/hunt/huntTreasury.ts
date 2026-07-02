import { sql } from "drizzle-orm";
import { outpostTreasury } from "@/db/schema";
import type { DbExecutor } from "@/lib/server/savesKv";

// 거점/타일 금고 입금 — 사냥세 3갈래(점령지 세금·NPC 세금·타일 정착지 세금)가
// runOneHunt 안에서 동일한 upsert 블록을 3벌 복붙하던 것(2026-07 통합).
// 금액 산출은 huntTax.ts(순수), 행선지 결정은 라우트, 여기는 입금 한 문장만 담당.
export async function creditOutpostTreasury(
  tx: DbExecutor,
  outpostId: string,
  gold: number,
  nowMs: number,
): Promise<void> {
  await tx
    .insert(outpostTreasury)
    .values({ outpostId, gold, updatedAt: new Date(nowMs) })
    .onConflictDoUpdate({
      target: outpostTreasury.outpostId,
      set: {
        gold: sql`${outpostTreasury.gold} + ${gold}`,
        updatedAt: new Date(nowMs),
      },
    });
}
