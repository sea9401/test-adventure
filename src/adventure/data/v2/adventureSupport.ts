export const MUSEUN_COIN_PACKAGES = [
  { id: "coin_1000", coins: 1_000, priceKrw: 10_000 },
  { id: "coin_2000", coins: 2_000, priceKrw: 20_000 },
  { id: "coin_3000", coins: 3_000, priceKrw: 30_000 },
  { id: "coin_5000", coins: 5_000, priceKrw: 50_000 },
] as const;

export const ADVENTURE_SUPPORT_PASS = {
  id: "monthly_adventure_support",
  name: "월간 모험 지원권",
  durationDays: 30,
  coinPrice: 1_000,
  staminaMaxBonus: 1_000,
  staminaActivationGrant: 1_000,
  staminaRegenBonusPct: 20,
  marketplaceSlotBonus: 10,
  marketplaceTaxRate: 0.05,
  freeMaxHuntBatch: 10,
  activeMaxHuntBatch: 50,
} as const;

export const PREMIUM_ADVENTURE_SUPPORT_PASS = {
  id: "monthly_adventure_support_premium",
  name: "월간 모험 지원권 프리미엄",
  durationDays: 30,
  coinPrice: 2_500,
  staminaMaxBonus: 3_000,
  staminaActivationGrant: 3_000,
  staminaRegenBonusPct: 20,
  marketplaceSlotBonus: 20,
  marketplaceTaxRate: 0.05,
  activeMaxHuntBatch: 100,
  cosmeticExtensionGrant: 2,
} as const;

export const ADVENTURE_SUPPORT_MAX_GRANT_DAYS = 3_650;
const DAY_MS = 24 * 60 * 60 * 1_000;

export type AdventureSupportState = {
  activatedAt: number;
  activeUntil: number;
  premiumUntil?: number;
};

export type AdventureSupportTier = "none" | "standard" | "premium";

export type AdventureSupportTierInput = AdventureSupportTier | boolean;

export type AdventureSupportBenefits = {
  staminaMaxBonus: number;
  staminaActivationGrant: number;
  staminaRegenBonusPct: number;
  marketplaceSlotBonus: number;
  marketplaceTaxRate: number;
  maxHuntBatch: number;
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
  const premiumUntil =
    typeof raw.premiumUntil === "number" &&
    Number.isFinite(raw.premiumUntil) &&
    raw.premiumUntil > 0
      ? Math.min(Math.floor(raw.premiumUntil), Math.floor(raw.activeUntil))
      : null;
  return {
    activatedAt: Math.floor(activatedAt),
    activeUntil: Math.floor(raw.activeUntil),
    ...(premiumUntil !== null ? { premiumUntil } : {}),
  };
}

export function adventureSupportTier(
  value: unknown,
  now: number = Date.now(),
): AdventureSupportTier {
  const state = parseAdventureSupportState(value);
  if (!state || state.activeUntil <= now) return "none";
  if (state.premiumUntil !== undefined && state.premiumUntil > now) {
    return "premium";
  }
  return "standard";
}

export function adventureSupportBenefits(
  tier: AdventureSupportTier,
): AdventureSupportBenefits {
  if (tier === "premium") {
    return {
      staminaMaxBonus: PREMIUM_ADVENTURE_SUPPORT_PASS.staminaMaxBonus,
      staminaActivationGrant:
        PREMIUM_ADVENTURE_SUPPORT_PASS.staminaActivationGrant,
      staminaRegenBonusPct:
        PREMIUM_ADVENTURE_SUPPORT_PASS.staminaRegenBonusPct,
      marketplaceSlotBonus:
        PREMIUM_ADVENTURE_SUPPORT_PASS.marketplaceSlotBonus,
      marketplaceTaxRate:
        PREMIUM_ADVENTURE_SUPPORT_PASS.marketplaceTaxRate,
      maxHuntBatch: PREMIUM_ADVENTURE_SUPPORT_PASS.activeMaxHuntBatch,
    };
  }
  if (tier === "standard") {
    return {
      staminaMaxBonus: ADVENTURE_SUPPORT_PASS.staminaMaxBonus,
      staminaActivationGrant: ADVENTURE_SUPPORT_PASS.staminaActivationGrant,
      staminaRegenBonusPct: ADVENTURE_SUPPORT_PASS.staminaRegenBonusPct,
      marketplaceSlotBonus: ADVENTURE_SUPPORT_PASS.marketplaceSlotBonus,
      marketplaceTaxRate: ADVENTURE_SUPPORT_PASS.marketplaceTaxRate,
      maxHuntBatch: ADVENTURE_SUPPORT_PASS.activeMaxHuntBatch,
    };
  }
  return {
    staminaMaxBonus: 0,
    staminaActivationGrant: 0,
    staminaRegenBonusPct: 0,
    marketplaceSlotBonus: 0,
    marketplaceTaxRate: 0,
    maxHuntBatch: ADVENTURE_SUPPORT_PASS.freeMaxHuntBatch,
  };
}

export function normalizeAdventureSupportTierInput(
  value: AdventureSupportTierInput,
): AdventureSupportTier {
  return typeof value === "boolean" ? (value ? "standard" : "none") : value;
}

export function adventureSupportActive(
  value: unknown,
  now: number = Date.now(),
): boolean {
  return adventureSupportTier(value, now) !== "none";
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
  const premiumUntil =
    previous?.premiumUntil !== undefined && previous.premiumUntil > now
      ? previous.premiumUntil
      : undefined;
  return {
    state: {
      activatedAt: previous?.activatedAt ?? now,
      // 활성 중 재지급은 남은 기간 뒤에 이어지고, 만료 상태면 수령 시점부터 다시 시작한다.
      activeUntil: Math.max(now, previous?.activeUntil ?? 0) + days * DAY_MS,
      ...(premiumUntil !== undefined ? { premiumUntil } : {}),
    },
    days,
    firstActivation: previous === null,
  };
}

export function grantPremiumAdventureSupport(
  value: unknown,
  requestedDays: unknown,
  now: number = Date.now(),
): AdventureSupportGrant | null {
  const days = normalizeAdventureSupportGrantDays(requestedDays);
  if (days <= 0) return null;
  const previous = parseAdventureSupportState(value);
  const durationMs = days * DAY_MS;
  const premiumActive =
    previous?.premiumUntil !== undefined &&
    previous.premiumUntil > now &&
    previous.activeUntil > now;

  if (premiumActive && previous.premiumUntil !== undefined) {
    return {
      state: {
        activatedAt: previous.activatedAt,
        premiumUntil: previous.premiumUntil + durationMs,
        activeUntil: previous.activeUntil + durationMs,
      },
      days,
      firstActivation: false,
    };
  }

  const remainingStandardMs = Math.max(
    0,
    (previous?.activeUntil ?? 0) - now,
  );
  const premiumUntil = now + durationMs;
  return {
    state: {
      activatedAt: previous?.activatedAt ?? now,
      premiumUntil,
      activeUntil: premiumUntil + remainingStandardMs,
    },
    days,
    firstActivation: previous === null,
  };
}

export const ALL_HUNT_COUNTS = [1, 5, 10, 50, 100] as const;
export type HuntCount = (typeof ALL_HUNT_COUNTS)[number];

export function huntCountsForAdventureSupport(
  support: AdventureSupportTierInput,
): readonly HuntCount[] {
  const max = adventureSupportBenefits(
    normalizeAdventureSupportTierInput(support),
  ).maxHuntBatch;
  return ALL_HUNT_COUNTS.filter((count) => count <= max);
}

export function maxHuntBatchForAdventureSupport(
  support: AdventureSupportTierInput,
): number {
  return adventureSupportBenefits(
    normalizeAdventureSupportTierInput(support),
  ).maxHuntBatch;
}

export function normalizeHuntCount(
  value: unknown,
  adventureSupport: AdventureSupportTierInput,
): HuntCount {
  const count = Math.floor(Number(value));
  return huntCountsForAdventureSupport(adventureSupport).includes(
    count as HuntCount,
  )
    ? (count as HuntCount)
    : 1;
}
