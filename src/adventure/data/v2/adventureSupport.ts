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
  staminaMaxBonus: 500,
  staminaActivationGrant: 500,
  staminaRegenBonusPct: 20,
  marketplaceSlotBonus: 10,
  marketplaceTaxRate: 0.05,
  freeMaxHuntBatch: 10,
  activeMaxHuntBatch: 50,
} as const;

export const ADVENTURE_SUPPORT_MAX_GRANT_DAYS = 3_650;
const DAY_MS = 24 * 60 * 60 * 1_000;

export type AdventureSupportState = {
  activatedAt: number;
  activeUntil: number;
};

export type AdventureSupportGrant = {
  state: AdventureSupportState;
  days: number;
  firstActivation: boolean;
};

export function parseAdventureSupportState(
  value: unknown,
): AdventureSupportState | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (
    typeof raw.activeUntil !== "number" ||
    !Number.isFinite(raw.activeUntil) ||
    raw.activeUntil <= 0
  ) {
    return null;
  }
  const activatedAt =
    typeof raw.activatedAt === "number" &&
    Number.isFinite(raw.activatedAt) &&
    raw.activatedAt > 0
      ? raw.activatedAt
      : raw.activeUntil;
  return {
    activatedAt: Math.floor(activatedAt),
    activeUntil: Math.floor(raw.activeUntil),
  };
}

export function adventureSupportActive(
  value: unknown,
  now: number = Date.now(),
): boolean {
  const state = parseAdventureSupportState(value);
  return state !== null && state.activeUntil > now;
}

export function normalizeAdventureSupportGrantDays(value: unknown): number {
  const days = Math.floor(Number(value));
  return Number.isFinite(days)
    ? Math.max(0, Math.min(ADVENTURE_SUPPORT_MAX_GRANT_DAYS, days))
    : 0;
}

export function grantAdventureSupport(
  value: unknown,
  requestedDays: unknown,
  now: number = Date.now(),
): AdventureSupportGrant | null {
  const days = normalizeAdventureSupportGrantDays(requestedDays);
  if (days <= 0) return null;
  const previous = parseAdventureSupportState(value);
  return {
    state: {
      activatedAt: previous?.activatedAt ?? now,
      // 활성 중 재지급은 남은 기간 뒤에 이어지고, 만료 상태면 수령 시점부터 다시 시작한다.
      activeUntil: Math.max(now, previous?.activeUntil ?? 0) + days * DAY_MS,
    },
    days,
    firstActivation: previous === null,
  };
}

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
