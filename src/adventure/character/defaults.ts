const BASE_HP = 97;
const HP_PER_LEVEL = 5;

export function maxHpForLevel(level: number): number {
  return BASE_HP + Math.max(0, level - 1) * HP_PER_LEVEL;
}
