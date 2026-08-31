export const GROWTH_LEAP_SAVE_KEY = "growth-leap.v1";
export const MONTHLY_STAMINA_BUNDLE_ITEM_ID =
  "monthly_stamina_potion_bundle" as const;
export const GROWTH_LEAP_PACKAGE_ITEM_ID = "growth_leap_package" as const;

export const MONTHLY_STAMINA_BUNDLE_PRICE = 300;
export const MONTHLY_STAMINA_BUNDLE_POTIONS = 20;
export const MONTHLY_STAMINA_BUNDLE_LIMIT = 3;
export const GROWTH_LEAP_PACKAGE_PRICE = 1_200;
export const GROWTH_LEAP_PACKAGE_POTIONS = 30;
export const GROWTH_LEAP_PROGRESS_MS = 30 * 24 * 60 * 60 * 1_000;
export const GROWTH_LEAP_CLAIM_GRACE_MS = 7 * 24 * 60 * 60 * 1_000;
export const GROWTH_LEAP_MAX_STAMINA = 50_000;

export const GROWTH_LEAP_MILESTONES = [
  {
    id: "growth_1",
    name: "첫걸음",
    stamina: 3_000,
    masteryCertificates: 300,
    staminaPotions: 5,
    cosmeticExtensions: 0,
  },
  {
    id: "growth_2",
    name: "성장 가속",
    stamina: 10_000,
    masteryCertificates: 1_000,
    staminaPotions: 0,
    cosmeticExtensions: 0,
  },
  {
    id: "growth_3",
    name: "숙련 축적",
    stamina: 20_000,
    masteryCertificates: 600,
    staminaPotions: 5,
    cosmeticExtensions: 0,
  },
  {
    id: "growth_4",
    name: "도약 준비",
    stamina: 35_000,
    masteryCertificates: 1_400,
    staminaPotions: 0,
    cosmeticExtensions: 0,
  },
  {
    id: "growth_5",
    name: "도약 완료",
    stamina: 50_000,
    masteryCertificates: 1_700,
    staminaPotions: 0,
    cosmeticExtensions: 1,
  },
] as const;

export type GrowthLeapMilestoneId =
  (typeof GROWTH_LEAP_MILESTONES)[number]["id"];

export type GrowthLeapMissionState = {
  purchasedAt: number;
  progressUntil: number;
  claimUntil: number;
  staminaSpent: number;
  claimedMilestoneIds: GrowthLeapMilestoneId[];
};

export type GrowthLeapSave = {
  monthlyPeriod: string | null;
  monthlyPurchases: number;
  mission?: GrowthLeapMissionState;
};

export type GrowthLeapMissionView =
  | { status: "not_purchased" }
  | {
      status: "active" | "claim_only" | "expired";
      purchasedAt: number;
      progressUntil: number;
      claimUntil: number;
      staminaSpent: number;
      maxStamina: number;
      milestones: Array<{
        id: GrowthLeapMilestoneId;
        name: string;
        stamina: number;
        masteryCertificates: number;
        staminaPotions: number;
        cosmeticExtensions: number;
        claimed: boolean;
        claimable: boolean;
      }>;
    };

const MILESTONE_IDS = new Set<GrowthLeapMilestoneId>(
  GROWTH_LEAP_MILESTONES.map((milestone) => milestone.id),
);

function nonNegativeInt(value: unknown, max = Number.MAX_SAFE_INTEGER): number {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.min(max, Math.max(0, Math.floor(number)))
    : 0;
}

function positiveTimestamp(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : null;
}

function isMonthKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function kstMonthKey(now: number): string {
  const shifted = new Date(now + 9 * 60 * 60 * 1_000);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function parseGrowthLeapSave(raw: unknown): GrowthLeapSave {
  const value =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const parsed: GrowthLeapSave = {
    monthlyPeriod: isMonthKey(value.monthlyPeriod)
      ? value.monthlyPeriod
      : null,
    monthlyPurchases: nonNegativeInt(
      value.monthlyPurchases,
      MONTHLY_STAMINA_BUNDLE_LIMIT,
    ),
  };
  const missionRaw =
    value.mission && typeof value.mission === "object"
      ? (value.mission as Record<string, unknown>)
      : null;
  if (!missionRaw) return parsed;
  const purchasedAt = positiveTimestamp(missionRaw.purchasedAt);
  const progressUntil = positiveTimestamp(missionRaw.progressUntil);
  const claimUntil = positiveTimestamp(missionRaw.claimUntil);
  if (
    purchasedAt === null ||
    progressUntil === null ||
    claimUntil === null ||
    progressUntil < purchasedAt ||
    claimUntil < progressUntil
  ) {
    return parsed;
  }
  const claimed = Array.isArray(missionRaw.claimedMilestoneIds)
    ? missionRaw.claimedMilestoneIds.filter(
        (id): id is GrowthLeapMilestoneId =>
          typeof id === "string" &&
          MILESTONE_IDS.has(id as GrowthLeapMilestoneId),
      )
    : [];
  parsed.mission = {
    purchasedAt,
    progressUntil,
    claimUntil,
    staminaSpent: nonNegativeInt(
      missionRaw.staminaSpent,
      GROWTH_LEAP_MAX_STAMINA,
    ),
    claimedMilestoneIds: [...new Set(claimed)],
  };
  return parsed;
}

export function buyMonthlyStaminaBundle(raw: unknown, now: number) {
  const current = parseGrowthLeapSave(raw);
  const period = kstMonthKey(now);
  const purchases = current.monthlyPeriod === period
    ? current.monthlyPurchases
    : 0;
  if (purchases >= MONTHLY_STAMINA_BUNDLE_LIMIT) {
    return { ok: false as const, error: "monthly_limit" as const };
  }
  const nextPurchases = purchases + 1;
  return {
    ok: true as const,
    purchases: nextPurchases,
    remaining: MONTHLY_STAMINA_BUNDLE_LIMIT - nextPurchases,
    state: {
      ...current,
      monthlyPeriod: period,
      monthlyPurchases: nextPurchases,
    },
  };
}

export function activateGrowthLeap(raw: unknown, now: number) {
  const current = parseGrowthLeapSave(raw);
  if (current.mission) {
    return { ok: false as const, error: "already_owned" as const };
  }
  const purchasedAt = Math.max(1, Math.floor(now));
  return {
    ok: true as const,
    state: {
      ...current,
      mission: {
        purchasedAt,
        progressUntil: purchasedAt + GROWTH_LEAP_PROGRESS_MS,
        claimUntil:
          purchasedAt + GROWTH_LEAP_PROGRESS_MS + GROWTH_LEAP_CLAIM_GRACE_MS,
        staminaSpent: 0,
        claimedMilestoneIds: [],
      },
    },
  };
}

export function recordGrowthLeapStamina(
  raw: unknown,
  amount: number,
  now: number,
): GrowthLeapSave {
  const current = parseGrowthLeapSave(raw);
  const mission = current.mission;
  const spent = nonNegativeInt(amount);
  if (
    !mission ||
    spent <= 0 ||
    now < mission.purchasedAt ||
    now > mission.progressUntil ||
    mission.staminaSpent >= GROWTH_LEAP_MAX_STAMINA
  ) {
    return current;
  }
  return {
    ...current,
    mission: {
      ...mission,
      staminaSpent: Math.min(
        GROWTH_LEAP_MAX_STAMINA,
        mission.staminaSpent + spent,
      ),
    },
  };
}

export function growthLeapMissionView(
  raw: unknown,
  now: number,
): GrowthLeapMissionView {
  const mission = parseGrowthLeapSave(raw).mission;
  if (!mission) return { status: "not_purchased" };
  const status =
    now <= mission.progressUntil
      ? "active"
      : now <= mission.claimUntil
        ? "claim_only"
        : "expired";
  const claimed = new Set(mission.claimedMilestoneIds);
  return {
    status,
    purchasedAt: mission.purchasedAt,
    progressUntil: mission.progressUntil,
    claimUntil: mission.claimUntil,
    staminaSpent: mission.staminaSpent,
    maxStamina: GROWTH_LEAP_MAX_STAMINA,
    milestones: GROWTH_LEAP_MILESTONES.map((milestone) => ({
      ...milestone,
      claimed: claimed.has(milestone.id),
      claimable:
        status !== "expired" &&
        mission.staminaSpent >= milestone.stamina &&
        !claimed.has(milestone.id),
    })),
  };
}

export function claimGrowthLeapMilestone(
  raw: unknown,
  milestoneId: GrowthLeapMilestoneId,
  now: number,
) {
  const current = parseGrowthLeapSave(raw);
  const mission = current.mission;
  if (!mission) return { ok: false as const, error: "not_purchased" as const };
  const milestone = GROWTH_LEAP_MILESTONES.find(
    (candidate) => candidate.id === milestoneId,
  );
  if (!milestone) {
    return { ok: false as const, error: "unknown_milestone" as const };
  }
  if (now > mission.claimUntil) {
    return { ok: false as const, error: "expired" as const };
  }
  if (mission.claimedMilestoneIds.includes(milestoneId)) {
    return { ok: false as const, error: "already_claimed" as const };
  }
  if (mission.staminaSpent < milestone.stamina) {
    return { ok: false as const, error: "not_complete" as const };
  }
  return {
    ok: true as const,
    reward: {
      masteryCertificates: milestone.masteryCertificates,
      staminaPotions: milestone.staminaPotions,
      cosmeticExtensions: milestone.cosmeticExtensions,
    },
    state: {
      ...current,
      mission: {
        ...mission,
        claimedMilestoneIds: [
          ...mission.claimedMilestoneIds,
          milestoneId,
        ],
      },
    },
  };
}

export function growthLeapShopView(raw: unknown, now: number) {
  const current = parseGrowthLeapSave(raw);
  const period = kstMonthKey(now);
  const purchases = current.monthlyPeriod === period
    ? current.monthlyPurchases
    : 0;
  return {
    monthlyStaminaBundle: {
      purchases,
      remaining: MONTHLY_STAMINA_BUNDLE_LIMIT - purchases,
      limit: MONTHLY_STAMINA_BUNDLE_LIMIT,
    },
    growthLeapPackage: { owned: current.mission !== undefined },
  };
}
