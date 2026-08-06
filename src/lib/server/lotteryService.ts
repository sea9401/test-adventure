import { and, asc, eq, gt, inArray } from "drizzle-orm";
import { db } from "@/db";
import { economyEvents } from "@/db/schema";
import { lotteryPurchases, lotteryRounds } from "@/db/lotterySchema";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function int(value: unknown): number {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function economyGoldDelta(value: number): number {
  return Math.max(0, Math.min(2_147_483_647, Math.trunc(value)));
}

async function refundLotteryGold(
  tx: Tx,
  credits: ReadonlyMap<string, number>,
  roundIds: readonly number[],
): Promise<void> {
  for (const userId of [...credits.keys()].sort()) {
    const amount = int(credits.get(userId));
    if (amount <= 0) continue;
    const character = await lockSaveForUpdate<Record<string, unknown>>(
      tx,
      userId,
      "character.v2",
      {},
    );
    await upsertSave(tx, userId, "character.v2", {
      ...character,
      gold: int(character.gold),
      bankedGold: int(character.bankedGold) + amount,
    });
    await tx.insert(economyEvents).values({
      userId,
      eventType: "refund.lottery.retired",
      goldDelta: economyGoldDelta(amount),
      itemKind: "lottery_ticket",
      itemId: "feature_retired",
      quantity: 1,
      detail: {
        reason: "feature_retired",
        roundIds,
        actualGoldDelta: amount,
      },
    });
  }
}

/**
 * 복권 기능 종료 처리.
 *
 * 신규 회차를 만들지 않고, 아직 추첨되지 않은 open/rolled_over 회차의 실제
 * 결제액(amountPaid > 0)만 은행 골드로 돌려준다. 이월용 복제 티켓은 결제액이
 * 0이므로 중복 환불되지 않는다. 회차 잠금과 refunded 상태 전환 덕분에 크론이
 * 여러 번 호출되어도 한 번만 환불된다.
 */
export async function retireLottery(now = new Date()) {
  return db.transaction(async (tx) => {
    const rounds = await tx
      .select({ id: lotteryRounds.id })
      .from(lotteryRounds)
      .where(inArray(lotteryRounds.status, ["open", "rolled_over"]))
      .orderBy(asc(lotteryRounds.id))
      .for("update");
    const roundIds = rounds.map((round) => round.id);
    if (roundIds.length === 0) {
      return { refundedRounds: 0, refundedUsers: 0, refundedGold: 0 };
    }

    const finalizedRounds = await tx
      .select({ id: lotteryRounds.id })
      .from(lotteryRounds)
      .where(inArray(lotteryRounds.status, ["settled", "refunded"]));
    const finalizedRoundIds = finalizedRounds.map((round) => round.id);
    const finalizedCarryRows = finalizedRoundIds.length
      ? await tx
          .select({ requestId: lotteryPurchases.requestId })
          .from(lotteryPurchases)
          .where(
            and(
              inArray(lotteryPurchases.roundId, finalizedRoundIds),
              eq(lotteryPurchases.isCarried, true),
            ),
          )
      : [];
    const consumedPurchaseIds = new Set(
      finalizedCarryRows.flatMap(({ requestId }) => {
        const match = /^rollover:(\d+):\d+$/.exec(requestId);
        return match ? [Number(match[1])] : [];
      }),
    );
    const purchases = await tx
      .select({
        id: lotteryPurchases.id,
        userId: lotteryPurchases.userId,
        amountPaid: lotteryPurchases.amountPaid,
      })
      .from(lotteryPurchases)
      .where(
        and(
          inArray(lotteryPurchases.roundId, roundIds),
          gt(lotteryPurchases.amountPaid, 0),
        ),
      );
    const credits = new Map<string, number>();
    for (const purchase of purchases) {
      if (consumedPurchaseIds.has(purchase.id)) continue;
      credits.set(
        purchase.userId,
        (credits.get(purchase.userId) ?? 0) + Number(purchase.amountPaid),
      );
    }

    await refundLotteryGold(tx, credits, roundIds);
    await tx
      .update(lotteryRounds)
      .set({
        status: "refunded",
        feeAmount: 0,
        prizePool: 0,
        settledAt: now,
      })
      .where(inArray(lotteryRounds.id, roundIds));

    return {
      refundedRounds: roundIds.length,
      refundedUsers: credits.size,
      refundedGold: [...credits.values()].reduce((sum, amount) => sum + amount, 0),
    };
  });
}
