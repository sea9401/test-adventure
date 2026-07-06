// 낚시 연속 성공 기록 + 보상 버프.
// 크기/어종 확률은 건드리지 않고, 소량 코인과 지도 조각 드랍률만 보정한다.

export const FISHING_STREAK_KEY = "fishing-streak.v1";

export type FishingStreakState = {
  current: number;
  best: number;
};

export type FishingStreakBuff = {
  tier: number;
  coinBonus: number;
  fragmentChanceBonus: number;
};

const STREAK_STEP = 5;
const STREAK_TIER_CAP = 5;
const COIN_BONUS_PER_TIER = 1;
const FRAGMENT_CHANCE_BONUS_PER_TIER = 0.02;

export function parseFishingStreak(raw: unknown): FishingStreakState {
  if (!raw || typeof raw !== "object") return { current: 0, best: 0 };
  const r = raw as Record<string, unknown>;
  const current =
    typeof r.current === "number" && Number.isFinite(r.current)
      ? Math.max(0, Math.floor(r.current))
      : 0;
  const best =
    typeof r.best === "number" && Number.isFinite(r.best)
      ? Math.max(0, Math.floor(r.best))
      : 0;
  return { current, best: Math.max(best, current) };
}

export function nextFishingStreak(raw: unknown): FishingStreakState {
  const prev = parseFishingStreak(raw);
  const current = prev.current + 1;
  return { current, best: Math.max(prev.best, current) };
}

export function resetFishingStreak(raw: unknown): FishingStreakState {
  const prev = parseFishingStreak(raw);
  return { current: 0, best: prev.best };
}

export function fishingStreakBuff(streak: number): FishingStreakBuff {
  const tier = Math.max(
    0,
    Math.min(STREAK_TIER_CAP, Math.floor(streak / STREAK_STEP)),
  );
  return {
    tier,
    coinBonus: tier * COIN_BONUS_PER_TIER,
    fragmentChanceBonus: tier * FRAGMENT_CHANCE_BONUS_PER_TIER,
  };
}
