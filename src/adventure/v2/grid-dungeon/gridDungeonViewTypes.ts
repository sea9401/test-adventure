// 격자 던전 뷰 공유 타입 — 서버 응답(run 상태) 봉투. 뷰 본체와 패널 파일들이 공용.
import {
  GRID_DUNGEON_ENTRANCE,
  type GridDungeonPublicRun,
  type GridDungeonRouteId,
  type GridDungeonSupportRole,
} from "@/adventure/data/v2/gridDungeon";

export type GridDungeonState = {
  ok: boolean;
  entrance: typeof GRID_DUNGEON_ENTRANCE;
  atEntrance: boolean;
  rewardQuota?: {
    dayKey: string;
    claimed: number;
    limit: number;
    remaining: number;
  };
  mySupportRole?: GridDungeonSupportRole | null;
  mySupportDaily?: {
    dayKey: string;
    used: number;
    useLimit: number;
    rewarded: number;
    rewardLimit: number;
    honorPerReward: number;
  };
  supportCandidates?: Array<{
    userId: string;
    name: string;
    level: number;
    job: string;
    supportLimit: number;
    supportRemaining: number;
    supportRole: GridDungeonSupportRole | null;
  }>;
  history?: Array<{
    id: string;
    outcome: "cleared" | "failed" | "abandoned";
    routeId: GridDungeonRouteId;
    at: number;
    rewardGold: number;
    drops?: Record<string, number>;
    materialCount?: number;
    rewardLimited?: boolean;
    exploredTiles: number;
    hp: number;
    supporterCount: number;
    bossReached: boolean;
    combatCount: number;
    totalCombatTurns: number;
    durationMs: number;
    message: string;
    detailReason?: string;
  }>;
  run: GridDungeonPublicRun | null;
  error?: string;
};
