import {
  UNEXPLORED_POOL_BY_ID,
  UNEXPLORED_POOL_IDS,
  type UnexploredPoolId,
} from "./unexploredMonsterPools";

export const UNEXPLORED_BASE_MIN_SHARE = 30;
export const UNEXPLORED_TRACKING_BASE_MIN_SHARE = 25;
export const UNEXPLORED_SPECIAL_MAX_SHARE = 70;
const CORE_REQUEST_SHARE = 20;
const FREQUENCY_REQUEST_SHARE = 10;

export type UnexploredPoolSelection = {
  poolId: UnexploredPoolId;
  core: boolean;
  frequency: boolean;
};

export type UnexploredEncounterShare =
  | { kind: "base"; share: number }
  | { kind: "pool"; poolId: UnexploredPoolId; share: number };

export type UnexploredEncounterGroup =
  | { kind: "base" }
  | { kind: "pool"; poolId: UnexploredPoolId };

function normalizedUnitRoll(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1 - Number.EPSILON, Math.max(0, value));
}

export function unexploredEncounterShares(
  selections: readonly UnexploredPoolSelection[],
  options: { baseMinShare?: 25 | 30 } = {},
): UnexploredEncounterShare[] {
  const requested = UNEXPLORED_POOL_IDS.map((poolId) => {
    const selected = selections.find((entry) => entry.poolId === poolId);
    return {
      poolId,
      requested:
        (selected?.core ? CORE_REQUEST_SHARE : 0) +
        (selected?.core && selected.frequency ? FREQUENCY_REQUEST_SHARE : 0),
    };
  }).filter((entry) => entry.requested > 0);
  const requestedTotal = requested.reduce(
    (sum, entry) => sum + entry.requested,
    0,
  );
  if (requestedTotal === 0) return [{ kind: "base", share: 100 }];

  const baseMinShare = options.baseMinShare ?? UNEXPLORED_BASE_MIN_SHARE;
  const specialTotal = Math.min(100 - baseMinShare, requestedTotal);
  const raw = requested.map((entry, index) => ({
    ...entry,
    index,
    rawShare: (entry.requested / requestedTotal) * specialTotal,
  }));
  const allocated = raw.map((entry) => Math.floor(entry.rawShare));
  let remainder =
    specialTotal - allocated.reduce((sum, value) => sum + value, 0);
  for (const entry of [...raw].sort(
    (a, b) =>
      b.rawShare -
        Math.floor(b.rawShare) -
        (a.rawShare - Math.floor(a.rawShare)) ||
      a.index - b.index,
  )) {
    if (remainder <= 0) break;
    allocated[entry.index] += 1;
    remainder -= 1;
  }

  return [
    { kind: "base", share: 100 - specialTotal },
    ...raw.map((entry) => ({
      kind: "pool" as const,
      poolId: entry.poolId,
      share: allocated[entry.index],
    })),
  ];
}

export function pickUnexploredEncounterGroup(
  shares: readonly UnexploredEncounterShare[],
  rng: () => number,
): UnexploredEncounterGroup {
  const point = normalizedUnitRoll(rng()) * 100;
  let cumulative = 0;
  for (const entry of shares) {
    cumulative += entry.share;
    if (point < cumulative) {
      return entry.kind === "base"
        ? { kind: "base" }
        : { kind: "pool", poolId: entry.poolId };
    }
  }
  return { kind: "base" };
}

export type UnexploredMonsterPick =
  | { source: "base"; monsterId: string }
  | {
      source: "special";
      poolId: UnexploredPoolId;
      monsterId: string;
    };

export function pickUnexploredMonster(params: {
  baseMonsterIds: readonly string[];
  shares: readonly UnexploredEncounterShare[];
  groupRng: () => number;
  monsterRng: () => number;
}): UnexploredMonsterPick | null {
  const group = pickUnexploredEncounterGroup(params.shares, params.groupRng);
  const ids =
    group.kind === "base"
      ? params.baseMonsterIds
      : [UNEXPLORED_POOL_BY_ID[group.poolId].launchMonster.id];
  if (ids.length === 0) return null;
  const roll = normalizedUnitRoll(params.monsterRng());
  const monsterId =
    ids[Math.min(ids.length - 1, Math.floor(roll * ids.length))];
  return group.kind === "base"
    ? { source: "base", monsterId }
    : { source: "special", poolId: group.poolId, monsterId };
}
