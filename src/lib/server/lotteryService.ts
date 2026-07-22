import { randomBytes, createHash } from "node:crypto";
import { and, asc, desc, eq, inArray, lte } from "drizzle-orm";
import { db } from "@/db";
import { economyEvents } from "@/db/schema";
import {
  lotteryPurchases,
  lotteryRounds,
  lotteryWinners,
} from "@/db/lotterySchema";
import { spendGoldWith } from "@/adventure/data/v2/coreLoopConfig";
import {
  LOTTERY_MAX_TICKETS_PER_ROUND,
  LOTTERY_MIN_TICKETS_TO_DRAW,
  LOTTERY_PURCHASE_COOLDOWN_MS,
  LOTTERY_TICKET_PRICE,
  lotteryPrizeAmounts,
  lotteryRoundWindow,
  type LotterySnapshot,
} from "@/lib/lottery";
import {
  lockSaveForUpdate,
  readSave,
  upsertSave,
  type DbExecutor,
} from "@/lib/server/savesKv";
import { drawLotteryTickets } from "./lotteryDraw";

type LotteryRoundRow = typeof lotteryRounds.$inferSelect;
type LotteryPurchaseRow = typeof lotteryPurchases.$inferSelect;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type LotteryPurchaseError =
  | "invalid_ticket_count"
  | "invalid_request_id"
  | "round_ticket_limit"
  | "purchase_rate_limited"
  | "insufficient_gold";

export type LotteryPurchaseResult =
  | {
      ok: true;
      replayed: boolean;
      purchasedTickets: number;
      amountPaid: number;
      snapshot: LotterySnapshot;
    }
  | {
      ok: false;
      error: LotteryPurchaseError;
      remainingTickets?: number;
      requiredGold?: number;
    };

function newRoundSecret() {
  return randomBytes(32).toString("hex");
}

function hashSecret(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

function int(value: unknown) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function economyGoldDelta(value: number) {
  return Math.max(-2_147_483_648, Math.min(2_147_483_647, Math.trunc(value)));
}

async function ensureCurrentRound(tx: Tx, now: Date): Promise<LotteryRoundRow> {
  const window = lotteryRoundWindow(now.getTime());
  const [existing] = await tx
    .select()
    .from(lotteryRounds)
    .where(eq(lotteryRounds.startsAt, new Date(window.startsAt)))
    .limit(1);
  if (existing) return existing;

  const secret = newRoundSecret();
  await tx
    .insert(lotteryRounds)
    .values({
      status: "open",
      startsAt: new Date(window.startsAt),
      endsAt: new Date(window.endsAt),
      ticketPrice: LOTTERY_TICKET_PRICE,
      commitHash: hashSecret(secret),
      drawSecret: secret,
    })
    .onConflictDoNothing({ target: lotteryRounds.startsAt });

  const [round] = await tx
    .select()
    .from(lotteryRounds)
    .where(eq(lotteryRounds.startsAt, new Date(window.startsAt)))
    .limit(1);
  if (!round) throw new Error("lottery round creation failed");
  return round;
}

function purchaseForOrdinal(
  purchases: LotteryPurchaseRow[],
  ordinal: number,
): { purchase: LotteryPurchaseRow; ticketNumber: number } {
  let cursor = 0;
  for (const purchase of purchases) {
    const next = cursor + purchase.ticketCount;
    if (ordinal <= next) {
      return {
        purchase,
        ticketNumber: purchase.firstTicketNumber + (ordinal - cursor - 1),
      };
    }
    cursor = next;
  }
  throw new Error("lottery ticket owner not found");
}

async function creditBankedGold(
  tx: Tx,
  credits: Map<string, number>,
): Promise<Map<string, { gold: number; bankedGold: number }>> {
  const balances = new Map<string, { gold: number; bankedGold: number }>();
  // 모든 정산 경로가 같은 userId 순서로 character.v2 를 잠가 교착을 피한다.
  for (const userId of [...credits.keys()].sort()) {
    const amount = int(credits.get(userId));
    const character = await lockSaveForUpdate<Record<string, unknown>>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const gold = int(character.gold);
    const bankedGold = int(character.bankedGold) + amount;
    await upsertSave(tx, userId, "character.v2", {
      ...character,
      gold,
      bankedGold,
    });
    balances.set(userId, { gold, bankedGold });
  }
  return balances;
}

async function settleRound(tx: Tx, roundId: number, now: Date) {
  const [round] = await tx
    .select()
    .from(lotteryRounds)
    .where(eq(lotteryRounds.id, roundId))
    .for("update")
    .limit(1);
  if (!round || round.status !== "open" || round.endsAt > now) return;

  const purchases = await tx
    .select()
    .from(lotteryPurchases)
    .where(eq(lotteryPurchases.roundId, round.id))
    .orderBy(asc(lotteryPurchases.firstTicketNumber));
  const eligibleTickets = purchases.reduce(
    (sum, purchase) => sum + purchase.ticketCount,
    0,
  );

  if (eligibleTickets < LOTTERY_MIN_TICKETS_TO_DRAW) {
    const refunds = new Map<string, number>();
    for (const purchase of purchases) {
      refunds.set(
        purchase.userId,
        (refunds.get(purchase.userId) ?? 0) + Number(purchase.amountPaid),
      );
    }
    await creditBankedGold(tx, refunds);
    for (const [userId, amount] of refunds) {
      await tx.insert(economyEvents).values({
        userId,
        eventType: "reward.lottery.refund",
        goldDelta: economyGoldDelta(amount),
        itemKind: "lottery_ticket",
        itemId: String(round.id),
        quantity: purchases
          .filter((purchase) => purchase.userId === userId)
          .reduce((sum, purchase) => sum + purchase.ticketCount, 0),
        detail: {
          roundId: round.id,
          reason: "not_enough_tickets",
          actualGoldDelta: amount,
        },
      });
    }
    await tx
      .update(lotteryRounds)
      .set({
        status: "refunded",
        feeAmount: 0,
        prizePool: 0,
        settledAt: now,
      })
      .where(eq(lotteryRounds.id, round.id));
    return;
  }

  const { feeAmount, prizePool, prizes } = lotteryPrizeAmounts(
    Number(round.grossPool),
  );
  const ordinals = drawLotteryTickets(
    eligibleTickets,
    round.drawSecret,
    round.id,
    3,
  );
  const winners = ordinals.map((ordinal, index) => ({
    ...purchaseForOrdinal(purchases, ordinal),
    rank: index + 1,
    prizeAmount: prizes[index],
  }));
  const credits = new Map<string, number>();
  for (const winner of winners) {
    credits.set(
      winner.purchase.userId,
      (credits.get(winner.purchase.userId) ?? 0) + winner.prizeAmount,
    );
  }
  await creditBankedGold(tx, credits);

  await tx.insert(lotteryWinners).values(
    winners.map((winner) => ({
      roundId: round.id,
      rank: winner.rank,
      purchaseId: winner.purchase.id,
      userId: winner.purchase.userId,
      actorName: winner.purchase.actorName,
      ticketNumber: winner.ticketNumber,
      prizeAmount: winner.prizeAmount,
    })),
  );
  for (const [userId, amount] of credits) {
    await tx.insert(economyEvents).values({
      userId,
      eventType: "reward.lottery.prize",
      goldDelta: economyGoldDelta(amount),
      itemKind: "lottery_prize",
      itemId: String(round.id),
      quantity: winners.filter((winner) => winner.purchase.userId === userId).length,
      detail: {
        roundId: round.id,
        ranks: winners
          .filter((winner) => winner.purchase.userId === userId)
          .map((winner) => winner.rank),
        actualGoldDelta: amount,
      },
    });
  }
  await tx
    .update(lotteryRounds)
    .set({
      status: "settled",
      feeAmount,
      prizePool,
      settledAt: now,
    })
    .where(eq(lotteryRounds.id, round.id));
}

async function advanceRounds(tx: Tx, now: Date) {
  const due = await tx
    .select({ id: lotteryRounds.id })
    .from(lotteryRounds)
    .where(and(eq(lotteryRounds.status, "open"), lte(lotteryRounds.endsAt, now)))
    .orderBy(asc(lotteryRounds.endsAt));
  for (const round of due) await settleRound(tx, round.id, now);
  return ensureCurrentRound(tx, now);
}

async function snapshotInTx(
  tx: Tx,
  userId: string,
  currentRound: LotteryRoundRow,
): Promise<LotterySnapshot> {
  const currentPurchases = await tx
    .select()
    .from(lotteryPurchases)
    .where(eq(lotteryPurchases.roundId, currentRound.id))
    .orderBy(desc(lotteryPurchases.createdAt));
  const myTickets = currentPurchases
    .filter((purchase) => purchase.userId === userId)
    .reduce((sum, purchase) => sum + purchase.ticketCount, 0);
  const [previous] = await tx
    .select()
    .from(lotteryRounds)
    .where(inArray(lotteryRounds.status, ["settled", "refunded"]))
    .orderBy(desc(lotteryRounds.endsAt))
    .limit(1);
  const winners = previous
    ? await tx
        .select()
        .from(lotteryWinners)
        .where(eq(lotteryWinners.roundId, previous.id))
        .orderBy(asc(lotteryWinners.rank))
    : [];
  const character = await readSave<Record<string, unknown>>(
    tx as DbExecutor,
    userId,
    "character.v2",
    {},
  );
  const currentPrizes = lotteryPrizeAmounts(Number(currentRound.grossPool));

  return {
    round: {
      id: currentRound.id,
      startsAt: currentRound.startsAt.getTime(),
      endsAt: currentRound.endsAt.getTime(),
      ticketPrice: currentRound.ticketPrice,
      totalTickets: currentRound.totalTickets,
      grossPool: Number(currentRound.grossPool),
      prizePool: currentPrizes.prizePool,
      commitHash: currentRound.commitHash,
    },
    myTickets,
    remainingTickets: Math.max(0, LOTTERY_MAX_TICKETS_PER_ROUND - myTickets),
    recentPurchases: currentPurchases.slice(0, 30).map((purchase) => ({
      id: purchase.id,
      actorName: purchase.actorName,
      ticketCount: purchase.ticketCount,
      createdAt: purchase.createdAt.getTime(),
      mine: purchase.userId === userId,
    })),
    previousRound: previous
      ? {
          id: previous.id,
          status: previous.status === "refunded" ? "refunded" : "settled",
          totalTickets: previous.totalTickets,
          grossPool: Number(previous.grossPool),
          feeAmount: Number(previous.feeAmount),
          prizePool: Number(previous.prizePool),
          settledAt: previous.settledAt?.getTime() ?? previous.endsAt.getTime(),
          commitHash: previous.commitHash,
          revealSecret: previous.drawSecret,
          winners: winners.map((winner) => ({
            rank: winner.rank,
            actorName: winner.actorName,
            ticketNumber: winner.ticketNumber,
            prizeAmount: Number(winner.prizeAmount),
            mine: winner.userId === userId,
          })),
        }
      : null,
    viewerGold: int(character.gold),
    viewerBankedGold: int(character.bankedGold),
  };
}

export async function getLotterySnapshot(
  userId: string,
  now = new Date(),
): Promise<LotterySnapshot> {
  return db.transaction(async (tx) => {
    const current = await advanceRounds(tx, now);
    return snapshotInTx(tx, userId, current);
  });
}

export async function settleLotteryRounds(now = new Date()) {
  return db.transaction(async (tx) => {
    const current = await advanceRounds(tx, now);
    return {
      currentRoundId: current.id,
      startsAt: current.startsAt.getTime(),
      endsAt: current.endsAt.getTime(),
    };
  });
}

export async function purchaseLotteryTickets(input: {
  userId: string;
  actorName: string;
  ticketCount: number;
  requestId: string;
  now?: Date;
}): Promise<LotteryPurchaseResult> {
  if (
    !Number.isInteger(input.ticketCount) ||
    input.ticketCount < 1 ||
    input.ticketCount > LOTTERY_MAX_TICKETS_PER_ROUND
  ) {
    return { ok: false, error: "invalid_ticket_count" };
  }
  if (input.requestId.length < 8 || input.requestId.length > 100) {
    return { ok: false, error: "invalid_request_id" };
  }
  const now = input.now ?? new Date();

  return db.transaction(async (tx) => {
    const current = await advanceRounds(tx, now);
    const [round] = await tx
      .select()
      .from(lotteryRounds)
      .where(eq(lotteryRounds.id, current.id))
      .for("update")
      .limit(1);
    if (!round) throw new Error("lottery round not found");

    // 회차 락을 잡은 뒤 재확인해야 같은 requestId 동시 요청도 하나만 결제된다.
    const [existingRequest] = await tx
      .select()
      .from(lotteryPurchases)
      .where(
        and(
          eq(lotteryPurchases.userId, input.userId),
          eq(lotteryPurchases.requestId, input.requestId),
        ),
      )
      .limit(1);
    if (existingRequest) {
      return {
        ok: true,
        replayed: true,
        purchasedTickets: existingRequest.ticketCount,
        amountPaid: Number(existingRequest.amountPaid),
        snapshot: await snapshotInTx(tx, input.userId, round),
      };
    }

    const [latestPurchase] = await tx
      .select({ createdAt: lotteryPurchases.createdAt })
      .from(lotteryPurchases)
      .where(eq(lotteryPurchases.userId, input.userId))
      .orderBy(desc(lotteryPurchases.createdAt))
      .limit(1);
    if (
      latestPurchase &&
      now.getTime() - latestPurchase.createdAt.getTime() < LOTTERY_PURCHASE_COOLDOWN_MS
    ) {
      return { ok: false, error: "purchase_rate_limited" };
    }

    const userPurchases = await tx
      .select({ ticketCount: lotteryPurchases.ticketCount })
      .from(lotteryPurchases)
      .where(
        and(
          eq(lotteryPurchases.roundId, round.id),
          eq(lotteryPurchases.userId, input.userId),
        ),
      );
    const alreadyBought = userPurchases.reduce(
      (sum, purchase) => sum + purchase.ticketCount,
      0,
    );
    const remainingTickets = LOTTERY_MAX_TICKETS_PER_ROUND - alreadyBought;
    if (input.ticketCount > remainingTickets) {
      return { ok: false, error: "round_ticket_limit", remainingTickets };
    }

    const amountPaid = input.ticketCount * round.ticketPrice;
    const character = await lockSaveForUpdate<Record<string, unknown>>(
      tx,
      input.userId,
      "character.v2",
      {},
    );
    const spent = spendGoldWith(
      int(character.gold),
      int(character.bankedGold),
      amountPaid,
      true,
    );
    if (!spent.ok) {
      return { ok: false, error: "insufficient_gold", requiredGold: amountPaid };
    }
    await upsertSave(tx, input.userId, "character.v2", {
      ...character,
      gold: spent.gold,
      bankedGold: spent.bankedGold,
    });
    const [purchase] = await tx
      .insert(lotteryPurchases)
      .values({
        roundId: round.id,
        userId: input.userId,
        requestId: input.requestId,
        actorName: input.actorName.slice(0, 80),
        ticketCount: input.ticketCount,
        firstTicketNumber: round.totalTickets + 1,
        amountPaid,
        createdAt: now,
      })
      .returning();
    const updatedRound = {
      ...round,
      totalTickets: round.totalTickets + input.ticketCount,
      grossPool: Number(round.grossPool) + amountPaid,
    };
    await tx
      .update(lotteryRounds)
      .set({
        totalTickets: updatedRound.totalTickets,
        grossPool: updatedRound.grossPool,
      })
      .where(eq(lotteryRounds.id, round.id));
    await tx.insert(economyEvents).values({
      userId: input.userId,
      eventType: "sink.lottery.ticket",
      goldDelta: -amountPaid,
      itemKind: "lottery_ticket",
      itemId: String(round.id),
      quantity: input.ticketCount,
      detail: {
        roundId: round.id,
        purchaseId: purchase.id,
        requestId: input.requestId,
        firstTicketNumber: purchase.firstTicketNumber,
      },
    });

    return {
      ok: true,
      replayed: false,
      purchasedTickets: input.ticketCount,
      amountPaid,
      snapshot: await snapshotInTx(tx, input.userId, updatedRound),
    };
  });
}
