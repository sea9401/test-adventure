export function cookingSpecialtyRank(xp: number): 1 | 2 | 3 | 4 | 5 {
  const safeXp = Math.max(0, Math.floor(Number(xp) || 0));
  if (safeXp >= 1_500) return 5;
  if (safeXp >= 700) return 4;
  if (safeXp >= 300) return 3;
  if (safeXp >= 100) return 2;
  return 1;
}
