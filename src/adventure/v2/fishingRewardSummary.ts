export type FishingRewardSummaryInput = {
  catchItem?: unknown;
  catchItemStatus?: "awarded" | "roll_miss" | "daily_cap";
  catchItemDaily?: {
    name: string;
    awarded: number;
    cap: number;
  };
  coinsGained?: number;
  dailyCatchCoins?: { earned: number; cap: number };
  levelRewardCoins?: number;
  hotTime?: {
    fishingCoinPct: number;
    catchBonus: number;
    levelBonus: number;
  } | null;
  fishingXpGained?: number;
  fishingLevel?: number;
  fishingLevelUp?: boolean;
  masteryGained?: number;
};

/** 낚시 완료 카드의 보상 칩 문구 — 낚시 진행 경험치와 직업 숙련도를 구분한다. */
export function fishingRewardSummaryLabels(
  result: FishingRewardSummaryInput,
): string[] {
  const labels: string[] = [];
  if (
    !result.catchItem &&
    result.catchItemStatus === "daily_cap" &&
    result.catchItemDaily
  ) {
    labels.push(
      `${result.catchItemDaily.name} 오늘 획득 한도 ${result.catchItemDaily.awarded}/${result.catchItemDaily.cap}`,
    );
  }
  if (result.coinsGained != null && result.coinsGained > 0) {
    labels.push(`코인 +${result.coinsGained}`);
  } else if (
    result.coinsGained === 0 &&
    result.dailyCatchCoins &&
    result.dailyCatchCoins.cap > 0 &&
    result.dailyCatchCoins.earned >= result.dailyCatchCoins.cap
  ) {
    labels.push("일일 낚시 코인 제한 도달 · 추가 코인 +0");
  }
  if (result.levelRewardCoins != null && result.levelRewardCoins > 0) {
    labels.push(`레벨업 보상 +${result.levelRewardCoins}`);
  }
  if (
    result.hotTime &&
    (result.hotTime.catchBonus > 0 || result.hotTime.levelBonus > 0)
  ) {
    labels.push(
      `핫타임 +${result.hotTime.fishingCoinPct}% · 코인 +${
        result.hotTime.catchBonus + result.hotTime.levelBonus
      }`,
    );
  }
  if (result.fishingXpGained != null && result.fishingXpGained > 0) {
    labels.push(
      `낚시 경험치 +${result.fishingXpGained}${
        result.fishingLevel ? ` · 낚시 Lv ${result.fishingLevel}` : ""
      }${result.fishingLevelUp ? " 상승" : ""}`,
    );
  }
  if (result.masteryGained != null && result.masteryGained > 0) {
    labels.push(`직업 숙련도 +${result.masteryGained}`);
  }
  return labels;
}
