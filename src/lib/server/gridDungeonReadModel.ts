import { type DropResult } from "@/adventure/data/v2/dungeonDrops";
import {
  GRID_DUNGEON_ENTRANCE,
  gridDungeonBossReached,
  gridDungeonKey,
  gridDungeonLayoutForRoute,
  gridDungeonRewardQuota,
  gridDungeonTileAt,
  isAtGridDungeonEntrance,
  parseGridDungeonHistory,
  parseGridDungeonRun,
  withGridDungeonLayout,
  type GridDungeonFailureReason,
  type GridDungeonMoveDir,
  type GridDungeonResolvedCombat,
  type GridDungeonRun,
  type GridDungeonTileKind,
} from "@/adventure/data/v2/gridDungeon";
import {
  GRID_DUNGEON_SUPPORT_DAILY_REWARD_LIMIT,
  GRID_DUNGEON_SUPPORT_DAILY_USE_LIMIT,
  GRID_DUNGEON_SUPPORT_HONOR_REWARD,
  parseGridDungeonSupportDaily,
  parseGridDungeonSupportProfile,
  type CharSave,
  type GridDungeonSupportCandidate,
} from "./gridDungeonSupport";

export function publicState(
  run: unknown,
  charSave: CharSave | null = null,
  dailyRewards: unknown = null,
  historyRaw: unknown = null,
  supportCandidates: GridDungeonSupportCandidate[] = [],
  supportProfileRaw: unknown = null,
  supportDailyRaw: unknown = null,
) {
  const parsed = parseGridDungeonRun(run);
  const supportDaily = parseGridDungeonSupportDaily(supportDailyRaw);
  return {
    ok: true,
    entrance: GRID_DUNGEON_ENTRANCE,
    atEntrance: isAtGridDungeonEntrance(charSave?.tilePos ?? null),
    rewardQuota: gridDungeonRewardQuota(dailyRewards),
    history: parseGridDungeonHistory(historyRaw),
    mySupportRole: parseGridDungeonSupportProfile(supportProfileRaw).role,
    mySupportDaily: {
      dayKey: supportDaily.dayKey,
      used: supportDaily.used,
      useLimit: GRID_DUNGEON_SUPPORT_DAILY_USE_LIMIT,
      rewarded: supportDaily.rewarded,
      rewardLimit: GRID_DUNGEON_SUPPORT_DAILY_REWARD_LIMIT,
      honorPerReward: GRID_DUNGEON_SUPPORT_HONOR_REWARD,
    },
    supportCandidates,
    run: withGridDungeonLayout(parsed),
  };
}


export function historyEntryFromRun({
  run,
  outcome,
  rewardGold = 0,
  drops = {},
  rewardLimited = false,
  detailReason,
  failureReason,
  at = Date.now(),
}: {
  run: GridDungeonRun;
  outcome: "cleared" | "failed" | "abandoned";
  rewardGold?: number;
  drops?: DropResult;
  rewardLimited?: boolean;
  detailReason?: string;
  failureReason?: GridDungeonFailureReason;
  at?: number;
}) {
  const outcomeLabel =
    outcome === "cleared" ? "클리어" : outcome === "failed" ? "실패" : "포기";
  const materialCount = Object.values(drops).reduce<number>(
    (sum, amount) => sum + Math.max(0, Math.floor(Number(amount) || 0)),
    0,
  );
  const fallbackReason =
    outcome === "cleared"
      ? rewardLimited
        ? "일일 재료 보상 횟수 소진으로 골드만 정산"
        : "출구 도달 후 보상 정산"
      : outcome === "failed"
        ? run.lastCombat?.outcome === "lose"
          ? `${run.lastCombat.enemyName} 전투 패배`
          : "HP 소진"
        : "탐험 직접 포기";
  return {
    id: `${run.id}:${outcome}:${at}`,
    outcome,
    routeId: run.routeId,
    at,
    rewardGold,
    drops,
    materialCount,
    rewardLimited,
    exploredTiles: new Set(run.visited).size,
    hp: run.hp,
    supporterCount: run.supporters.length,
    bossReached: gridDungeonBossReached(run),
    combatCount: run.combatCount,
    totalCombatTurns: run.totalCombatTurns,
    durationMs: Math.max(0, at - run.startedAt),
    message: `${GRID_DUNGEON_ENTRANCE.name} ${outcomeLabel}`,
    detailReason: detailReason ?? fallbackReason,
    ...(outcome === "failed"
      ? { failureReason: failureReason ?? "unknown" }
      : {}),
  };
}


export function failureReasonForFailedMove({
  tile,
  combat,
}: {
  tile: GridDungeonTileKind | null;
  combat: GridDungeonResolvedCombat | null;
}): GridDungeonFailureReason {
  if (combat?.outcome === "lose") {
    if (tile === "boss") return "combat_boss";
    if (tile === "elite") return "combat_elite";
    return "combat_monster";
  }
  if (tile === "trap") return "trap";
  return "hp_depleted";
}


export function failureDetailForFailedMove({
  reason,
  combat,
}: {
  reason: GridDungeonFailureReason;
  combat: GridDungeonResolvedCombat | null;
}): string {
  if (reason === "combat_boss") return "보스 전투 패배";
  if (reason === "combat_elite") return "정예 전투 패배";
  if (reason === "combat_monster") {
    return combat?.summary.enemyName
      ? `${combat.summary.enemyName} 전투 패배`
      : "일반 전투 패배";
  }
  if (reason === "trap") return "함정 피해로 HP 소진";
  if (reason === "hp_depleted") return "HP 소진";
  return "원인 미상 실패";
}


export function targetTileForMove(run: GridDungeonRun, dir: GridDungeonMoveDir) {
  const delta: Record<GridDungeonMoveDir, { x: number; y: number }> = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };
  const d = delta[dir];
  const next = { x: run.pos.x + d.x, y: run.pos.y + d.y };
  return {
    next,
    key: gridDungeonKey(next.x, next.y),
    tile: gridDungeonTileAt(
      next.x,
      next.y,
      gridDungeonLayoutForRoute(run.routeId),
    ),
  };
}
