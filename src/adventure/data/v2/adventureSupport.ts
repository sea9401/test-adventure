export const MUSEUN_COIN_PACKAGES = [
  { id: "coin_800", coins: 800, priceKrw: 7_900 },
  { id: "coin_1650", coins: 1_650, priceKrw: 15_900 },
  { id: "coin_3400", coins: 3_400, priceKrw: 31_900 },
] as const;

export const ADVENTURE_SUPPORT_PASS = {
  id: "monthly_adventure_support",
  name: "월간 모험 지원권",
  durationDays: 30,
  coinPrice: 800,
  staminaMaxBonus: 1_000,
  staminaActivationGrant: 1_000,
  staminaRegenBonusPct: 10,
  freeMaxHuntBatch: 10,
  activeMaxHuntBatch: 50,
} as const;

export const ALL_HUNT_COUNTS = [1, 5, 10, 50] as const;
export type HuntCount = (typeof ALL_HUNT_COUNTS)[number];

export function huntCountsForAdventureSupport(
  active: boolean,
): readonly HuntCount[] {
  const max = active
    ? ADVENTURE_SUPPORT_PASS.activeMaxHuntBatch
    : ADVENTURE_SUPPORT_PASS.freeMaxHuntBatch;
  return ALL_HUNT_COUNTS.filter((count) => count <= max);
}

export function maxHuntBatchForAdventureSupport(active: boolean): number {
  return active
    ? ADVENTURE_SUPPORT_PASS.activeMaxHuntBatch
    : ADVENTURE_SUPPORT_PASS.freeMaxHuntBatch;
}

export function normalizeHuntCount(
  value: unknown,
  adventureSupportActive: boolean,
): HuntCount {
  const count = Math.floor(Number(value));
  return huntCountsForAdventureSupport(adventureSupportActive).includes(
    count as HuntCount,
  )
    ? (count as HuntCount)
    : 1;
}
