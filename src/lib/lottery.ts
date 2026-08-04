export const LOTTERY_TICKET_PRICE = 150_000;
export const LOTTERY_MAX_TICKETS_PER_ROUND = 10;
export const LOTTERY_FEE_PERCENT = 10;
export const LOTTERY_BASE_PRIZE_POOL = 500_000;
export const LOTTERY_MIN_PARTICIPANTS_TO_DRAW = 3;
export const LOTTERY_PURCHASE_COOLDOWN_MS = 2_000;
export const LOTTERY_CYCLE_MS = 4 * 60 * 60 * 1_000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1_000;

export type LotteryCommand =
  | { kind: "buy"; count: number }
  | { kind: "info" }
  | { kind: "invalid" };

export type LotteryWinnerView = {
  rank: number;
  actorName: string;
  ticketNumber: number;
  prizeAmount: number;
  mine: boolean;
};

export type LotteryRoundResultView = {
  id: number;
  status: "settled" | "refunded" | "rolled_over";
  totalTickets: number;
  participantCount: number;
  grossPool: number;
  carryIn: number;
  feeAmount: number;
  prizePool: number;
  settledAt: number;
  commitHash: string;
  revealSecret: string;
  winners: LotteryWinnerView[];
};

export type LotterySnapshot = {
  round: {
    id: number;
    startsAt: number;
    endsAt: number;
    ticketPrice: number;
    totalTickets: number;
    participantCount: number;
    grossPool: number;
    carryIn: number;
    prizePool: number;
    commitHash: string;
  };
  myTickets: number;
  myCarriedTickets: number;
  remainingTickets: number;
  recentPurchases: Array<{
    id: number;
    actorName: string;
    ticketCount: number;
    isCarried: boolean;
    createdAt: number;
    mine: boolean;
  }>;
  recentRounds: LotteryRoundResultView[];
  previousRound: LotteryRoundResultView | null;
  viewerGold: number;
  viewerBankedGold: number;
};

export function lotteryRoundWindow(nowMs: number): {
  startsAt: number;
  endsAt: number;
} {
  const shifted = nowMs + KST_OFFSET_MS;
  const startsAt = Math.floor(shifted / LOTTERY_CYCLE_MS) * LOTTERY_CYCLE_MS - KST_OFFSET_MS;
  return { startsAt, endsAt: startsAt + LOTTERY_CYCLE_MS };
}

export function hasEnoughLotteryParticipants(participantCount: number): boolean {
  return Math.floor(Number(participantCount) || 0) >= LOTTERY_MIN_PARTICIPANTS_TO_DRAW;
}

export function lotteryPrizeAmounts(grossPool: number, carryIn = 0): {
  feeAmount: number;
  prizePool: number;
  prizes: [number, number, number];
} {
  const gross = Math.max(0, Math.floor(Number(grossPool) || 0));
  const carried = Math.max(0, Math.floor(Number(carryIn) || 0));
  const feeAmount = Math.floor((gross * LOTTERY_FEE_PERCENT) / 100);
  const startingPool = carried > 0 ? carried : LOTTERY_BASE_PRIZE_POOL;
  const prizePool = startingPool + gross - feeAmount;
  const first = Math.floor((prizePool * 70) / 100);
  const second = Math.floor((prizePool * 20) / 100);
  const third = prizePool - first - second;
  return { feeAmount, prizePool, prizes: [first, second, third] };
}

export function parseLotteryCommand(value: string): LotteryCommand {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized === "/복권") return { kind: "buy", count: 1 };
  if (normalized === "/복권 정보") return { kind: "info" };
  const match = /^\/복권 (\d+)$/.exec(normalized);
  if (!match) return { kind: "invalid" };
  const count = Number(match[1]);
  if (!Number.isInteger(count) || count < 1 || count > LOTTERY_MAX_TICKETS_PER_ROUND) {
    return { kind: "invalid" };
  }
  return { kind: "buy", count };
}
