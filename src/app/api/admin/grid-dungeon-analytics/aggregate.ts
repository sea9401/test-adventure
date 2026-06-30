import {
  GRID_DUNGEON_ROUTE_IDS,
  GRID_DUNGEON_ROUTES,
  type GridDungeonHistoryEntry,
  type GridDungeonRouteId,
} from "@/adventure/data/v2/gridDungeon";

type Outcome = GridDungeonHistoryEntry["outcome"];

export type GridDungeonAnalyticsUser = {
  userId: string;
  name: string;
  history: GridDungeonHistoryEntry[];
};

export type GridDungeonAnalyticsRun = {
  id: string;
  userId: string;
  userName: string;
  outcome: Outcome;
  routeId: GridDungeonRouteId;
  routeName: string;
  at: number;
  rewardGold: number;
  materialCount: number;
  exploredTiles: number;
  hp: number;
  partySize: number;
  bossReached: boolean;
  combatCount: number;
  totalCombatTurns: number;
  durationMs: number;
};

export type GridDungeonRouteAnalytics = {
  routeId: GridDungeonRouteId;
  routeName: string;
  runs: number;
  cleared: number;
  failed: number;
  abandoned: number;
  clearRatePct: number;
  bossReachRatePct: number;
  avgCombatTurns: number;
  avgCombatCount: number;
  avgPartySize: number;
  avgRewardGold: number;
  avgMaterials: number;
  avgDurationSec: number;
};

export type GridDungeonPartyAnalytics = {
  partySize: number;
  runs: number;
  cleared: number;
  clearRatePct: number;
  bossReachRatePct: number;
  avgCombatTurns: number;
  avgRewardGold: number;
};

export type GridDungeonAnalytics = {
  summary: {
    users: number;
    usersWithHistory: number;
    runs: number;
    cleared: number;
    failed: number;
    abandoned: number;
    clearRatePct: number;
    bossReachRatePct: number;
    avgCombatTurns: number;
    avgPartySize: number;
    avgRewardGold: number;
    avgMaterials: number;
    avgDurationSec: number;
    adminExcluded: number;
  };
  routes: GridDungeonRouteAnalytics[];
  partySizes: GridDungeonPartyAnalytics[];
  recentRuns: GridDungeonAnalyticsRun[];
};

type Acc = {
  runs: number;
  cleared: number;
  failed: number;
  abandoned: number;
  bossReached: number;
  combatTurns: number;
  combatCount: number;
  partySize: number;
  rewardGold: number;
  materials: number;
  durationMs: number;
};

function emptyAcc(): Acc {
  return {
    runs: 0,
    cleared: 0,
    failed: 0,
    abandoned: 0,
    bossReached: 0,
    combatTurns: 0,
    combatCount: 0,
    partySize: 0,
    rewardGold: 0,
    materials: 0,
    durationMs: 0,
  };
}

function pct(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 100) : 0;
}

function avg(n: number, d: number): number {
  return d > 0 ? Math.round(n / d) : 0;
}

function materialCount(drops: GridDungeonHistoryEntry["drops"]): number {
  return Object.values(drops ?? {}).reduce<number>(
    (sum, amount) => sum + Math.max(0, Math.floor(Number(amount) || 0)),
    0,
  );
}

function add(acc: Acc, run: GridDungeonAnalyticsRun) {
  acc.runs += 1;
  if (run.outcome === "cleared") acc.cleared += 1;
  else if (run.outcome === "failed") acc.failed += 1;
  else acc.abandoned += 1;
  if (run.bossReached) acc.bossReached += 1;
  acc.combatTurns += run.totalCombatTurns;
  acc.combatCount += run.combatCount;
  acc.partySize += run.partySize;
  acc.rewardGold += run.rewardGold;
  acc.materials += run.materialCount;
  acc.durationMs += run.durationMs;
}

function routeOutput(
  routeId: GridDungeonRouteId,
  acc: Acc,
): GridDungeonRouteAnalytics {
  return {
    routeId,
    routeName: GRID_DUNGEON_ROUTES[routeId].name,
    runs: acc.runs,
    cleared: acc.cleared,
    failed: acc.failed,
    abandoned: acc.abandoned,
    clearRatePct: pct(acc.cleared, acc.runs),
    bossReachRatePct: pct(acc.bossReached, acc.runs),
    avgCombatTurns: avg(acc.combatTurns, acc.runs),
    avgCombatCount: avg(acc.combatCount, acc.runs),
    avgPartySize: avg(acc.partySize * 10, acc.runs) / 10,
    avgRewardGold: avg(acc.rewardGold, acc.runs),
    avgMaterials: avg(acc.materials, acc.runs),
    avgDurationSec: avg(Math.round(acc.durationMs / 1000), acc.runs),
  };
}

function partyOutput(
  partySize: number,
  acc: Acc,
): GridDungeonPartyAnalytics {
  return {
    partySize,
    runs: acc.runs,
    cleared: acc.cleared,
    clearRatePct: pct(acc.cleared, acc.runs),
    bossReachRatePct: pct(acc.bossReached, acc.runs),
    avgCombatTurns: avg(acc.combatTurns, acc.runs),
    avgRewardGold: avg(acc.rewardGold, acc.runs),
  };
}

export function aggregateGridDungeonAnalytics(
  users: GridDungeonAnalyticsUser[],
  meta: { adminExcluded: number } = { adminExcluded: 0 },
): GridDungeonAnalytics {
  const runs: GridDungeonAnalyticsRun[] = [];
  for (const user of users) {
    for (const entry of user.history) {
      const route = GRID_DUNGEON_ROUTES[entry.routeId];
      runs.push({
        id: entry.id,
        userId: user.userId,
        userName: user.name,
        outcome: entry.outcome,
        routeId: entry.routeId,
        routeName: route.name,
        at: entry.at,
        rewardGold: entry.rewardGold,
        materialCount: materialCount(entry.drops),
        exploredTiles: entry.exploredTiles,
        hp: entry.hp,
        partySize: Math.max(1, entry.supporterCount + 1),
        bossReached: entry.bossReached,
        combatCount: entry.combatCount,
        totalCombatTurns: entry.totalCombatTurns,
        durationMs: entry.durationMs,
      });
    }
  }

  const total = emptyAcc();
  const byRoute: Record<GridDungeonRouteId, Acc> = {
    balanced: emptyAcc(),
    guardian: emptyAcc(),
    vault: emptyAcc(),
  };
  const byParty = new Map<number, Acc>();

  for (const run of runs) {
    add(total, run);
    add(byRoute[run.routeId], run);
    const partyAcc = byParty.get(run.partySize) ?? emptyAcc();
    add(partyAcc, run);
    byParty.set(run.partySize, partyAcc);
  }

  return {
    summary: {
      users: users.length,
      usersWithHistory: users.filter((u) => u.history.length > 0).length,
      runs: total.runs,
      cleared: total.cleared,
      failed: total.failed,
      abandoned: total.abandoned,
      clearRatePct: pct(total.cleared, total.runs),
      bossReachRatePct: pct(total.bossReached, total.runs),
      avgCombatTurns: avg(total.combatTurns, total.runs),
      avgPartySize: avg(total.partySize * 10, total.runs) / 10,
      avgRewardGold: avg(total.rewardGold, total.runs),
      avgMaterials: avg(total.materials, total.runs),
      avgDurationSec: avg(Math.round(total.durationMs / 1000), total.runs),
      adminExcluded: meta.adminExcluded,
    },
    routes: GRID_DUNGEON_ROUTE_IDS.map((id) => routeOutput(id, byRoute[id])),
    partySizes: [...byParty.entries()]
      .map(([partySize, acc]) => partyOutput(partySize, acc))
      .sort((a, b) => a.partySize - b.partySize),
    recentRuns: [...runs].sort((a, b) => b.at - a.at).slice(0, 50),
  };
}
