export function cookingSpecialtyRank(xp: number): 1 | 2 | 3 | 4 | 5 {
  const safeXp = Math.max(0, Math.floor(Number(xp) || 0));
  if (safeXp >= 1_500) return 5;
  if (safeXp >= 700) return 4;
  if (safeXp >= 300) return 3;
  if (safeXp >= 100) return 2;
  return 1;
}

/** 주 전문 분야를 바꾼 뒤 다시 바꿀 수 있을 때까지의 대기. 처음 고를 때는 대기가 없다. */
export const COOKING_SPECIALTY_CHANGE_COOLDOWN_MS = 86_400_000;
