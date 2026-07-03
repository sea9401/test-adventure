export const MASTERY_TOWER_SAVE_KEY = "mastery-tower.v1";
export const MASTERY_CERTIFICATE_KEY = "masteryCertificates";

export const MASTERY_TOWER_MAX_FLOOR = 30;

export const MASTERY_TOWER_MILESTONES = [
  { floor: 10, bonus: 100 },
  { floor: 20, bonus: 200 },
  { floor: 30, bonus: 300 },
] as const;

export type MasteryTowerState = {
  date: string;
  todayBestFloor: number;
  claimed: boolean;
  lifetimeBestFloor: number;
  firstClearRewardsClaimed: number[];
};

export function kstDateKey(now: number = Date.now()): string {
  return new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function masteryTowerFloorReward(floor: number): number {
  const f = clampFloor(floor);
  if (f <= 10) return f * 30;
  if (f <= 20) return 300 + (f - 10) * 45;
  return 750 + (f - 20) * 60;
}

export function masteryTowerRequiredPower(floor: number): number {
  const f = clampFloor(floor);
  if (f <= 0) return 0;
  if (f <= 10) return 45 + f * 10;
  if (f <= 20) return 145 + (f - 10) * 24;
  return 385 + (f - 20) * 55;
}

export function parseMasteryTowerState(
  raw: unknown,
  date: string = kstDateKey(),
): MasteryTowerState {
  const obj =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const savedDate = typeof obj.date === "string" ? obj.date : date;
  const claimedFloors = Array.isArray(obj.firstClearRewardsClaimed)
    ? obj.firstClearRewardsClaimed
        .map((v) => Math.floor(Number(v)))
        .filter((v) =>
          MASTERY_TOWER_MILESTONES.some((milestone) => milestone.floor === v),
        )
    : [];
  const base: MasteryTowerState = {
    date: savedDate,
    todayBestFloor: clampFloor(obj.todayBestFloor),
    claimed: obj.claimed === true,
    lifetimeBestFloor: clampFloor(obj.lifetimeBestFloor),
    firstClearRewardsClaimed: [...new Set(claimedFloors)].sort((a, b) => a - b),
  };
  if (base.date !== date) {
    return {
      ...base,
      date,
      todayBestFloor: 0,
      claimed: false,
    };
  }
  return base;
}

export function masteryTowerClaimPreview(
  state: MasteryTowerState,
): {
  base: number;
  firstClearBonus: number;
  total: number;
  newlyClaimedMilestones: number[];
} {
  if (state.claimed || state.todayBestFloor <= 0) {
    return { base: 0, firstClearBonus: 0, total: 0, newlyClaimedMilestones: [] };
  }
  const claimed = new Set(state.firstClearRewardsClaimed);
  const newlyClaimedMilestones = MASTERY_TOWER_MILESTONES.filter(
    (m) => state.todayBestFloor >= m.floor && !claimed.has(m.floor),
  );
  const base = masteryTowerFloorReward(state.todayBestFloor);
  const firstClearBonus = newlyClaimedMilestones.reduce(
    (sum, m) => sum + m.bonus,
    0,
  );
  return {
    base,
    firstClearBonus,
    total: base + firstClearBonus,
    newlyClaimedMilestones: newlyClaimedMilestones.map((m) => m.floor),
  };
}

export function clearMasteryTowerFloor(
  state: MasteryTowerState,
  floor: number,
): MasteryTowerState {
  const cleared = clampFloor(floor);
  return {
    ...state,
    todayBestFloor: Math.max(state.todayBestFloor, cleared),
    lifetimeBestFloor: Math.max(state.lifetimeBestFloor, cleared),
  };
}

function clampFloor(raw: unknown): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(MASTERY_TOWER_MAX_FLOOR, n));
}
