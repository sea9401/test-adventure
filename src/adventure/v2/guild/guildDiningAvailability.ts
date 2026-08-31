import { ASSOCIATION_DINING_POINTS_PER_TICKET } from "@/adventure/data/v2/guildDining";

export type DiningFacilitySource = "guild" | "association";

export type DiningAvailabilityState = {
  eligible: boolean;
  weeklySource?: DiningFacilitySource | null;
  currentSource: DiningFacilitySource;
  pantry: { ready: boolean; remaining: number };
  contributionPoints: number;
  availableTickets: number;
};

export function associationDiningContributionProgress(
  contributionPoints: number,
): { points: number; target: number; remaining: number } {
  const points =
    Math.max(0, Math.floor(contributionPoints)) %
    ASSOCIATION_DINING_POINTS_PER_TICKET;
  return {
    points,
    target: ASSOCIATION_DINING_POINTS_PER_TICKET,
    remaining: ASSOCIATION_DINING_POINTS_PER_TICKET - points,
  };
}

export function diningDonationQuantityLimit(args: {
  source: DiningFacilitySource;
  owned: number;
  batchSize: number;
  pointValue: number;
  contributionPoints: number;
  contributionCap: number | null;
  pantryRemaining: number;
}): number {
  const ownedBatches = Math.floor(args.owned / args.batchSize);
  const requestBatches = Math.floor(999 / args.batchSize);
  const maxBatches =
    args.source === "association"
      ? Math.min(ownedBatches, requestBatches)
      : Math.min(
          ownedBatches,
          Math.floor(
            Math.max(
              0,
              (args.contributionCap ?? 0) - args.contributionPoints,
            ) / args.pointValue,
          ),
          Math.floor(args.pantryRemaining / args.pointValue),
          requestBatches,
        );
  return Math.max(0, maxBatches) * args.batchSize;
}

export function guildDiningUnavailableReasons(
  state: DiningAvailabilityState,
): string[] {
  const reasons: string[] = [];
  const sourceConflict =
    state.weeklySource != null && state.weeklySource !== state.currentSource;

  if (sourceConflict) {
    const selectedName =
      state.weeklySource === "guild" ? "길드 식당" : "협회 식당";
    reasons.push(
      `이번 주 식당 이용처를 ${selectedName}으로 이미 선택했습니다. 다음 주 월요일 00:00 KST부터 다시 선택할 수 있습니다.`,
    );
  } else if (!state.eligible) {
    reasons.push(
      "이번 주 공동 준비가 시작된 뒤 길드에 가입하여 다음 주 월요일 00:00 KST부터 이용할 수 있습니다.",
    );
  }

  if (state.currentSource === "guild" && !state.pantry.ready) {
    reasons.push(
      `공동 식재료 준비가 끝나지 않았습니다. ${Math.max(0, state.pantry.remaining).toLocaleString("ko-KR")}점이 더 필요합니다.`,
    );
  }
  if (state.availableTickets <= 0) {
    if (state.currentSource === "association") {
      const progress = associationDiningContributionProgress(
        state.contributionPoints,
      );
      reasons.push(
        `사용 가능한 식권이 없습니다. 다음 식권까지 ${progress.remaining}점이 필요합니다.`,
      );
    } else {
      reasons.push("이번 주 사용할 수 있는 식권을 모두 사용했습니다.");
    }
  }

  return reasons;
}

export function guildDiningMenuUnavailableReason({
  isRecoveryMenu,
  charges,
}: {
  isRecoveryMenu: boolean;
  charges: { hp: number; mp: number; max: number };
}): string | null {
  if (
    isRecoveryMenu &&
    charges.hp >= charges.max &&
    charges.mp >= charges.max
  ) {
    return "HP·MP 충전량이 모두 가득 차 있어 이 메뉴를 주문할 수 없습니다.";
  }
  return null;
}
