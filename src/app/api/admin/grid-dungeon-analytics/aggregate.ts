import {
  GRID_DUNGEON_ROUTE_IDS,
  GRID_DUNGEON_ROUTES,
  type GridDungeonFailureReason,
  type GridDungeonHistoryEntry,
  type GridDungeonRouteId,
} from "@/adventure/data/v2/gridDungeon";

type Outcome = GridDungeonHistoryEntry["outcome"];

const FAILURE_REASON_IDS: GridDungeonFailureReason[] = [
  "combat_boss",
  "combat_elite",
  "combat_monster",
  "trap",
  "hp_depleted",
  "unknown",
];

const FAILURE_REASON_LABEL: Record<GridDungeonFailureReason, string> = {
  combat_boss: "보스 전투 패배",
  combat_elite: "정예 전투 패배",
  combat_monster: "일반 전투 패배",
  trap: "함정 HP 소진",
  hp_depleted: "HP 소진",
  unknown: "원인 미상",
};

export type GridDungeonAnalyticsUser = {
  userId: string;
  name: string;
  history: GridDungeonHistoryEntry[];
};

export type GridDungeonAnalyticsFilters = {
  sinceAt?: number;
  query?: string;
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
  failureReason?: GridDungeonFailureReason;
  failureReasonLabel?: string;
  detailReason: string;
};

export type GridDungeonRouteAnalytics = {
  routeId: GridDungeonRouteId;
  routeName: string;
  runs: number;
  cleared: number;
  failed: number;
  abandoned: number;
  clearRatePct: number;
  failureRatePct: number;
  bossReachRatePct: number;
  avgRemainingHp: number;
  avgCombatTurns: number;
  avgCombatCount: number;
  avgPartySize: number;
  avgRewardGold: number;
  avgMaterials: number;
  avgDurationSec: number;
  riskLevel: BalanceRiskLevel;
  riskLabel: string;
  riskReason: string;
};

export type GridDungeonPartyAnalytics = {
  partySize: number;
  runs: number;
  cleared: number;
  failed: number;
  clearRatePct: number;
  failureRatePct: number;
  bossReachRatePct: number;
  avgRemainingHp: number;
  avgCombatTurns: number;
  avgRewardGold: number;
};

export type BalanceRiskLevel = "ok" | "low_sample" | "too_hard" | "too_easy";

export type GridDungeonRoutePartyAnalytics = {
  routeId: GridDungeonRouteId;
  routeName: string;
  partySize: number;
  runs: number;
  cleared: number;
  failed: number;
  abandoned: number;
  clearRatePct: number;
  failureRatePct: number;
  bossReachRatePct: number;
  avgRemainingHp: number;
  avgCombatTurns: number;
  avgRewardGold: number;
  avgMaterials: number;
  riskLevel: BalanceRiskLevel;
  riskLabel: string;
  riskReason: string;
};

export type GridDungeonBalanceFlag = {
  id: string;
  severity: "danger" | "warning" | "info";
  title: string;
  detail: string;
  action: string;
  routeId?: GridDungeonRouteId;
  partySize?: number;
};

export type GridDungeonTuningCandidate = {
  id: string;
  priority: "high" | "medium" | "low";
  title: string;
  detail: string;
  action: string;
  routeId?: GridDungeonRouteId;
  partySize?: number;
};

export type GridDungeonFailureReasonAnalytics = {
  reason: GridDungeonFailureReason;
  label: string;
  runs: number;
  pctOfFailures: number;
};

export type GridDungeonAnalytics = {
  filters: {
    sinceAt: number | null;
    query: string;
  };
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
    avgRemainingHp: number;
    avgPartySize: number;
    avgRewardGold: number;
    avgMaterials: number;
    avgDurationSec: number;
    adminExcluded: number;
  };
  routes: GridDungeonRouteAnalytics[];
  partySizes: GridDungeonPartyAnalytics[];
  routeParties: GridDungeonRoutePartyAnalytics[];
  failureReasons: GridDungeonFailureReasonAnalytics[];
  balanceFlags: GridDungeonBalanceFlag[];
  tuningCandidates: GridDungeonTuningCandidate[];
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
  remainingHp: number;
  partySize: number;
  rewardGold: number;
  materials: number;
  durationMs: number;
  failureReasons: Record<GridDungeonFailureReason, number>;
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
    remainingHp: 0,
    partySize: 0,
    rewardGold: 0,
    materials: 0,
    durationMs: 0,
    failureReasons: {
      combat_boss: 0,
      combat_elite: 0,
      combat_monster: 0,
      trap: 0,
      hp_depleted: 0,
      unknown: 0,
    },
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
  acc.remainingHp += run.hp;
  acc.partySize += run.partySize;
  acc.rewardGold += run.rewardGold;
  acc.materials += run.materialCount;
  acc.durationMs += run.durationMs;
  if (run.outcome === "failed") {
    acc.failureReasons[run.failureReason ?? "unknown"] += 1;
  }
}

function failureReasonOutput(acc: Acc): GridDungeonFailureReasonAnalytics[] {
  return FAILURE_REASON_IDS.map((reason) => ({
    reason,
    label: FAILURE_REASON_LABEL[reason],
    runs: acc.failureReasons[reason],
    pctOfFailures: pct(acc.failureReasons[reason], acc.failed),
  })).filter((row) => row.runs > 0);
}

function riskFor(acc: Acc): {
  level: BalanceRiskLevel;
  label: string;
  reason: string;
} {
  const failureRate = pct(acc.failed, acc.runs);
  const clearRate = pct(acc.cleared, acc.runs);
  const bossReachRate = pct(acc.bossReached, acc.runs);
  if (acc.runs === 0) {
    return {
      level: "low_sample",
      label: "기록 없음",
      reason: "아직 해당 조건의 탐험 기록이 없습니다.",
    };
  }
  if (acc.runs < 5) {
    return {
      level: "low_sample",
      label: "표본 부족",
      reason: `${acc.runs}건이라 판단 보류`,
    };
  }
  if (failureRate >= 45 || clearRate <= 40) {
    return {
      level: "too_hard",
      label: "과위험",
      reason: `실패율 ${failureRate}% · 클리어율 ${clearRate}%`,
    };
  }
  if (clearRate >= 90 && bossReachRate >= 90) {
    return {
      level: "too_easy",
      label: "과쉬움",
      reason: `클리어율 ${clearRate}% · 보스 도달 ${bossReachRate}%`,
    };
  }
  return {
    level: "ok",
    label: "정상",
    reason: `클리어율 ${clearRate}% · 실패율 ${failureRate}%`,
  };
}

function normalizeSearch(raw: string | undefined): string {
  return (raw ?? "").trim().toLowerCase();
}

export function filterGridDungeonAnalyticsUsers(
  users: GridDungeonAnalyticsUser[],
  filters: GridDungeonAnalyticsFilters = {},
): GridDungeonAnalyticsUser[] {
  const query = normalizeSearch(filters.query);
  return users
    .filter((user) => {
      if (!query) return true;
      return (
        user.userId.toLowerCase().includes(query) ||
        user.name.toLowerCase().includes(query)
      );
    })
    .map((user) => ({
      ...user,
      history: user.history.filter((entry) => {
        if (filters.sinceAt != null && entry.at < filters.sinceAt) return false;
        return true;
      }),
    }));
}

function routeOutput(
  routeId: GridDungeonRouteId,
  acc: Acc,
): GridDungeonRouteAnalytics {
  const risk = riskFor(acc);
  return {
    routeId,
    routeName: GRID_DUNGEON_ROUTES[routeId].name,
    runs: acc.runs,
    cleared: acc.cleared,
    failed: acc.failed,
    abandoned: acc.abandoned,
    clearRatePct: pct(acc.cleared, acc.runs),
    failureRatePct: pct(acc.failed, acc.runs),
    bossReachRatePct: pct(acc.bossReached, acc.runs),
    avgRemainingHp: avg(acc.remainingHp, acc.runs),
    avgCombatTurns: avg(acc.combatTurns, acc.runs),
    avgCombatCount: avg(acc.combatCount, acc.runs),
    avgPartySize: avg(acc.partySize * 10, acc.runs) / 10,
    avgRewardGold: avg(acc.rewardGold, acc.runs),
    avgMaterials: avg(acc.materials, acc.runs),
    avgDurationSec: avg(Math.round(acc.durationMs / 1000), acc.runs),
    riskLevel: risk.level,
    riskLabel: risk.label,
    riskReason: risk.reason,
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
    failed: acc.failed,
    clearRatePct: pct(acc.cleared, acc.runs),
    failureRatePct: pct(acc.failed, acc.runs),
    bossReachRatePct: pct(acc.bossReached, acc.runs),
    avgRemainingHp: avg(acc.remainingHp, acc.runs),
    avgCombatTurns: avg(acc.combatTurns, acc.runs),
    avgRewardGold: avg(acc.rewardGold, acc.runs),
  };
}

function routePartyOutput(
  routeId: GridDungeonRouteId,
  partySize: number,
  acc: Acc,
): GridDungeonRoutePartyAnalytics {
  const risk = riskFor(acc);
  return {
    routeId,
    routeName: GRID_DUNGEON_ROUTES[routeId].name,
    partySize,
    runs: acc.runs,
    cleared: acc.cleared,
    failed: acc.failed,
    abandoned: acc.abandoned,
    clearRatePct: pct(acc.cleared, acc.runs),
    failureRatePct: pct(acc.failed, acc.runs),
    bossReachRatePct: pct(acc.bossReached, acc.runs),
    avgRemainingHp: avg(acc.remainingHp, acc.runs),
    avgCombatTurns: avg(acc.combatTurns, acc.runs),
    avgRewardGold: avg(acc.rewardGold, acc.runs),
    avgMaterials: avg(acc.materials, acc.runs),
    riskLevel: risk.level,
    riskLabel: risk.label,
    riskReason: risk.reason,
  };
}

function routePartyKey(routeId: GridDungeonRouteId, partySize: number) {
  return `${routeId}:${partySize}`;
}

function makeBalanceFlags(
  routes: GridDungeonRouteAnalytics[],
  routeParties: GridDungeonRoutePartyAnalytics[],
): GridDungeonBalanceFlag[] {
  const flags: GridDungeonBalanceFlag[] = [];
  for (const route of routes) {
    if (route.runs === 0) continue;
    if (route.riskLevel === "too_hard") {
      flags.push({
        id: `route:${route.routeId}:hard`,
        severity: "danger",
        routeId: route.routeId,
        title: `${route.routeName} 과위험`,
        detail: route.riskReason,
        action: "보스 깊이, 적 공격 스케일링, 샘 회복량 중 하나를 완화 후보로 확인하세요.",
      });
    } else if (route.riskLevel === "too_easy") {
      flags.push({
        id: `route:${route.routeId}:easy`,
        severity: "warning",
        routeId: route.routeId,
        title: `${route.routeName} 과쉬움`,
        detail: route.riskReason,
        action: "보상 대비 위험이 낮을 수 있습니다. 보스 압박 또는 보상 효율을 확인하세요.",
      });
    } else if (route.riskLevel === "low_sample") {
      flags.push({
        id: `route:${route.routeId}:sample`,
        severity: "info",
        routeId: route.routeId,
        title: `${route.routeName} 표본 부족`,
        detail: route.riskReason,
        action: "자동 튜닝 판단 전에 기록을 더 모으세요.",
      });
    }
  }
  for (const cell of routeParties) {
    if (cell.runs < 5 || cell.riskLevel === "ok") continue;
    flags.push({
      id: `route-party:${cell.routeId}:${cell.partySize}:${cell.riskLevel}`,
      severity: cell.riskLevel === "too_hard" ? "danger" : "warning",
      routeId: cell.routeId,
      partySize: cell.partySize,
      title: `${cell.routeName} ${cell.partySize}명 ${cell.riskLabel}`,
      detail: cell.riskReason,
      action:
        cell.riskLevel === "too_hard"
          ? "해당 파티 규모에서 전투 압박이 높은지 확인하세요."
          : "해당 파티 규모에서 위험 대비 보상이 과한지 확인하세요.",
    });
  }
  return flags.slice(0, 12);
}

function makeTuningCandidates(
  routes: GridDungeonRouteAnalytics[],
  routeParties: GridDungeonRoutePartyAnalytics[],
): GridDungeonTuningCandidate[] {
  const candidates: GridDungeonTuningCandidate[] = [];
  for (const route of routes) {
    if (route.runs < 5) continue;
    if (route.riskLevel === "too_hard") {
      candidates.push({
        id: `route:${route.routeId}:soften`,
        priority: "high",
        routeId: route.routeId,
        title: `${route.routeName} 난이도 완화 검토`,
        detail: `${route.riskReason} · 평균 남은 HP ${route.avgRemainingHp}`,
        action: "보스 깊이 1~2단계 하향 또는 파티 스케일링 완화를 우선 검토하세요.",
      });
    } else if (route.riskLevel === "too_easy") {
      candidates.push({
        id: `route:${route.routeId}:tighten`,
        priority: "medium",
        routeId: route.routeId,
        title: `${route.routeName} 보상/압박 재검토`,
        detail: `${route.riskReason} · 평균 골드 ${route.avgRewardGold.toLocaleString()}G`,
        action: "보스 압박 소폭 상향 또는 보상 기대값 조정을 검토하세요.",
      });
    }
  }

  for (const routeId of GRID_DUNGEON_ROUTE_IDS) {
    const solo = routeParties.find(
      (cell) => cell.routeId === routeId && cell.partySize === 1,
    );
    const trio = routeParties.find(
      (cell) => cell.routeId === routeId && cell.partySize === 3,
    );
    if (!solo || !trio || solo.runs < 5 || trio.runs < 5) continue;
    if (trio.clearRatePct - solo.clearRatePct >= 30) {
      candidates.push({
        id: `route:${routeId}:party-gap`,
        priority: "medium",
        routeId,
        title: `${GRID_DUNGEON_ROUTES[routeId].name} 파티 의존도 높음`,
        detail: `솔로 ${solo.clearRatePct}% · 3명 ${trio.clearRatePct}%`,
        action: "솔로 권장 경로가 아니라면 UI 문구를 유지하고, 솔로 권장 경로라면 보스 압박 완화를 검토하세요.",
      });
    }
  }
  return candidates.slice(0, 8);
}

export function aggregateGridDungeonAnalytics(
  users: GridDungeonAnalyticsUser[],
  meta: { adminExcluded: number } = { adminExcluded: 0 },
  filters: GridDungeonAnalyticsFilters = {},
): GridDungeonAnalytics {
  const filteredUsers = filterGridDungeonAnalyticsUsers(users, filters);
  const runs: GridDungeonAnalyticsRun[] = [];
  for (const user of filteredUsers) {
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
        failureReason: entry.failureReason,
        failureReasonLabel: entry.failureReason
          ? FAILURE_REASON_LABEL[entry.failureReason]
          : undefined,
        detailReason: entry.detailReason,
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
  const byRouteParty = new Map<string, Acc>();

  for (const run of runs) {
    add(total, run);
    add(byRoute[run.routeId], run);
    const partyAcc = byParty.get(run.partySize) ?? emptyAcc();
    add(partyAcc, run);
    byParty.set(run.partySize, partyAcc);
    const routePartyKeyValue = routePartyKey(run.routeId, run.partySize);
    const routePartyAcc = byRouteParty.get(routePartyKeyValue) ?? emptyAcc();
    add(routePartyAcc, run);
    byRouteParty.set(routePartyKeyValue, routePartyAcc);
  }
  const routeOutputs = GRID_DUNGEON_ROUTE_IDS.map((id) =>
    routeOutput(id, byRoute[id]),
  );
  const routePartyOutputs = GRID_DUNGEON_ROUTE_IDS.flatMap((routeId) =>
    [1, 2, 3].map((partySize) =>
      routePartyOutput(
        routeId,
        partySize,
        byRouteParty.get(routePartyKey(routeId, partySize)) ?? emptyAcc(),
      ),
    ),
  );

  return {
    filters: {
      sinceAt: filters.sinceAt ?? null,
      query: normalizeSearch(filters.query),
    },
    summary: {
      users: filteredUsers.length,
      usersWithHistory: filteredUsers.filter((u) => u.history.length > 0).length,
      runs: total.runs,
      cleared: total.cleared,
      failed: total.failed,
      abandoned: total.abandoned,
      clearRatePct: pct(total.cleared, total.runs),
      bossReachRatePct: pct(total.bossReached, total.runs),
      avgCombatTurns: avg(total.combatTurns, total.runs),
      avgRemainingHp: avg(total.remainingHp, total.runs),
      avgPartySize: avg(total.partySize * 10, total.runs) / 10,
      avgRewardGold: avg(total.rewardGold, total.runs),
      avgMaterials: avg(total.materials, total.runs),
      avgDurationSec: avg(Math.round(total.durationMs / 1000), total.runs),
      adminExcluded: meta.adminExcluded,
    },
    routes: routeOutputs,
    partySizes: [...byParty.entries()]
      .map(([partySize, acc]) => partyOutput(partySize, acc))
      .sort((a, b) => a.partySize - b.partySize),
    routeParties: routePartyOutputs,
    failureReasons: failureReasonOutput(total),
    balanceFlags: makeBalanceFlags(routeOutputs, routePartyOutputs),
    tuningCandidates: makeTuningCandidates(routeOutputs, routePartyOutputs),
    recentRuns: [...runs].sort((a, b) => b.at - a.at).slice(0, 50),
  };
}
