import type { V2CombatPattern } from "@/adventure/v2/combat/combatPattern";
import type { DropResult } from "./dungeonDrops";
import type { V2Element } from "./elements";
import { rollGuildWorkshopMaterialDrops } from "./guildWorkshopMaterials";

export const GRID_DUNGEON_SAVE_KEY = "grid-dungeon.v2" as const;
export const GRID_DUNGEON_DAILY_REWARDS_KEY =
  "grid-dungeon-daily-rewards.v2" as const;
export const GRID_DUNGEON_HISTORY_KEY = "grid-dungeon-history.v2" as const;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export const GRID_DUNGEON_ENTRANCE = {
  id: "old_ruins",
  name: "낡은 지하 유적",
  col: 3,
  row: 2,
} as const;

export const GRID_DUNGEON_SIZE = 5;
export const GRID_DUNGEON_MAX_HP = 10;
export const GRID_DUNGEON_FOUNTAIN_HEAL = 5;
const GRID_DUNGEON_TRAP_HP_LOSS_PCT = 0.2;
const GRID_DUNGEON_FOUNTAIN_HEAL_PCT = 0.5;

export const GRID_DUNGEON_ROUTE_IDS = [
  "balanced",
  "guardian",
  "vault",
] as const;

export type GridDungeonRouteId = (typeof GRID_DUNGEON_ROUTE_IDS)[number];

export type GridDungeonTileKind =
  | "start"
  | "empty"
  | "wall"
  | "monster"
  | "elite"
  | "treasure"
  | "trap"
  | "relic"
  | "fountain"
  | "boss"
  | "exit";

export type GridDungeonStatus = "active" | "cleared" | "claimed" | "failed";
export type GridDungeonMoveDir = "up" | "down" | "left" | "right";
export type GridDungeonSupportRole = "dps" | "healer" | "tank";

export type GridDungeonSupporterSnapshot = {
  userId: string;
  name: string;
  level: number;
  job: string;
  supportRole: GridDungeonSupportRole | null;
  maxHp: number;
  maxMp: number;
  mp: number;
  atk: number;
  magicAtk: number;
  def: number;
  spd: number;
  healMult: number;
  element: V2Element;
  skills: string[];
  pattern?: V2CombatPattern;
  capturedAt: number;
};

export type GridDungeonCombatPartyMember = {
  id: string;
  name: string;
  role: "main" | "supporter";
  formation: "front" | "back";
  supportRole: GridDungeonSupportRole | null;
  hpBefore?: number;
  hpAfter: number;
  maxHp: number;
  damageDealt: number;
  damageTaken: number;
  healingDone: number;
  skillUses: Record<string, number>;
};

export type GridDungeonResolvedCombat = {
  outcome: "win" | "lose";
  hpLost: number;
  rewardGold: number;
  drops: DropResult;
  message: string;
  summary: {
    enemyName: string;
    outcome: "win" | "lose";
    turns: number;
    hpLost: number;
    playerHpBefore: number;
    playerHpAfter: number;
    playerMaxHp: number;
    enemyHp: number;
    enemyMaxHp: number;
    rewardGold: number;
    party?: GridDungeonCombatPartyMember[];
    log: string[];
  };
};

export type GridDungeonDailyRewards = {
  dayKey: string;
  claimed: number;
};

export type GridDungeonRewardQuota = {
  dayKey: string;
  claimed: number;
  limit: number;
  remaining: number;
};

export type GridDungeonHistoryEntry = {
  id: string;
  outcome: "cleared" | "failed" | "abandoned";
  routeId: GridDungeonRouteId;
  at: number;
  rewardGold: number;
  drops: DropResult;
  materialCount: number;
  rewardLimited: boolean;
  exploredTiles: number;
  hp: number;
  supporterCount: number;
  bossReached: boolean;
  combatCount: number;
  totalCombatTurns: number;
  durationMs: number;
  message: string;
  detailReason: string;
};

export type GridDungeonRouteSummary = {
  routeId: GridDungeonRouteId;
  expectedGold: number;
  combatRooms: number;
  eliteRooms: number;
  trapRooms: number;
  treasureRooms: number;
  relicRooms: number;
  fountainRooms: number;
  materialRooms: number;
  materialDepth: number;
  avgMaterialDepth: number;
  bossGold: number;
};

export const GRID_DUNGEON_MOVE_DELTAS: Record<
  GridDungeonMoveDir,
  { x: number; y: number }
> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export const GRID_DUNGEON_ROOM_REWARDS = {
  monster: { hpLoss: 2, gold: 850 },
  elite: { hpLoss: 3, gold: 1_800 },
  treasure: { gold: 1_200 },
  trap: { hpLoss: 2 },
  relic: { gold: 500 },
  boss: { hpLoss: 5, gold: 5_000 },
} as const;

const GRID_DUNGEON_ROUTE_GOLD_OVERRIDES: Partial<
  Record<GridDungeonRouteId, Partial<Record<GridDungeonTileKind, number>>>
> = {
  vault: {
    treasure: 1_850,
    relic: 1_250,
    boss: 5_800,
  },
  guardian: {
    monster: 1_250,
    elite: 3_400,
    relic: 2_000,
    boss: 7_800,
  },
};

const GRID_DUNGEON_BASE_DROP_DEPTH: Partial<
  Record<GridDungeonTileKind, number>
> = {
  treasure: 43,
  relic: 36,
  boss: 55,
  elite: 30,
  monster: 12,
};

const GRID_DUNGEON_ROUTE_DROP_DEPTH_OVERRIDES: Partial<
  Record<GridDungeonRouteId, Partial<Record<GridDungeonTileKind, number>>>
> = {
  vault: {
    treasure: 56,
    relic: 52,
    boss: 62,
    monster: 14,
  },
  guardian: {
    monster: 16,
    elite: 38,
    relic: 45,
    boss: 70,
  },
};

export type GridDungeonRun = {
  id: string;
  routeId: GridDungeonRouteId;
  status: GridDungeonStatus;
  pos: { x: number; y: number };
  hp: number;
  maxHp: number;
  pendingGold: number;
  pendingDrops: DropResult;
  bossDefeated: boolean;
  supporters: GridDungeonSupporterSnapshot[];
  frontlineId?: string;
  visited: string[];
  revealed: string[];
  clearedEvents: string[];
  combatCount: number;
  totalCombatTurns: number;
  lastCombat?: GridDungeonResolvedCombat["summary"];
  lastMessage: string;
  startedAt: number;
  updatedAt: number;
  claimedAt?: number;
};

export type GridDungeonPublicRun = GridDungeonRun & {
  layout: GridDungeonTileKind[][];
};

const GRID_DUNGEON_BALANCED_LAYOUT: GridDungeonTileKind[][] = [
  ["treasure", "empty", "boss", "exit", "treasure"],
  ["wall", "empty", "wall", "empty", "wall"],
  ["monster", "empty", "fountain", "empty", "elite"],
  ["empty", "wall", "monster", "wall", "empty"],
  ["treasure", "empty", "start", "empty", "monster"],
];

const GRID_DUNGEON_GUARDIAN_LAYOUT: GridDungeonTileKind[][] = [
  ["treasure", "monster", "boss", "exit", "relic"],
  ["empty", "wall", "empty", "wall", "empty"],
  ["monster", "empty", "fountain", "empty", "monster"],
  ["trap", "wall", "elite", "empty", "trap"],
  ["relic", "empty", "start", "empty", "treasure"],
];

const GRID_DUNGEON_VAULT_LAYOUT: GridDungeonTileKind[][] = [
  ["treasure", "empty", "boss", "exit", "treasure"],
  ["relic", "wall", "monster", "empty", "trap"],
  ["treasure", "empty", "fountain", "empty", "treasure"],
  ["empty", "wall", "trap", "wall", "empty"],
  ["relic", "empty", "start", "empty", "treasure"],
];

export const GRID_DUNGEON_ROUTES: Record<
  GridDungeonRouteId,
  {
    id: GridDungeonRouteId;
    name: string;
    shortName: string;
    risk: string;
    description: string;
    layout: GridDungeonTileKind[][];
  }
> = {
  balanced: {
    id: "balanced",
    name: "균형 수색로",
    shortName: "균형",
    risk: "표준",
    description: "전투, 샘, 보상이 고르게 섞인 기본 경로입니다.",
    layout: GRID_DUNGEON_BALANCED_LAYOUT,
  },
  guardian: {
    id: "guardian",
    name: "수문장 회랑",
    shortName: "전투",
    risk: "높음",
    description: "정예 전투 압박이 큰 대신 전투 보상과 유물 보상이 높습니다.",
    layout: GRID_DUNGEON_GUARDIAN_LAYOUT,
  },
  vault: {
    id: "vault",
    name: "보물고 우회로",
    shortName: "보물",
    risk: "중간",
    description: "보물방이 많고 초반 함정을 지나야 하는 보상 중심 경로입니다.",
    layout: GRID_DUNGEON_VAULT_LAYOUT,
  },
};

export const GRID_DUNGEON_ROUTE_OPTIONS = GRID_DUNGEON_ROUTE_IDS.map(
  (id) => GRID_DUNGEON_ROUTES[id],
);

export const GRID_DUNGEON_LAYOUT = GRID_DUNGEON_ROUTES.balanced.layout;

export const GRID_DUNGEON_START = { x: 2, y: 4 } as const;

export function gridDungeonKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function isAtGridDungeonEntrance(pos?: {
  col?: number;
  row?: number;
} | null): boolean {
  return (
    pos?.col === GRID_DUNGEON_ENTRANCE.col &&
    pos?.row === GRID_DUNGEON_ENTRANCE.row
  );
}

export function gridDungeonTileAt(
  x: number,
  y: number,
  layout: GridDungeonTileKind[][] = GRID_DUNGEON_LAYOUT,
): GridDungeonTileKind | null {
  if (
    !Number.isInteger(x) ||
    !Number.isInteger(y) ||
    x < 0 ||
    y < 0 ||
    x >= GRID_DUNGEON_SIZE ||
    y >= GRID_DUNGEON_SIZE
  ) {
    return null;
  }
  return layout[y]?.[x] ?? null;
}

export function gridDungeonDayKey(now = Date.now()): string {
  return new Date(now + KST_OFFSET_MS).toISOString().slice(0, 10);
}

export function parseGridDungeonSupportRole(
  raw: unknown,
): GridDungeonSupportRole | null {
  return raw === "dps" || raw === "healer" || raw === "tank" ? raw : null;
}

export function parseGridDungeonRouteId(raw: unknown): GridDungeonRouteId {
  return typeof raw === "string" &&
    GRID_DUNGEON_ROUTE_IDS.includes(raw as GridDungeonRouteId)
    ? (raw as GridDungeonRouteId)
    : "balanced";
}

export function gridDungeonLayoutForRoute(
  routeId: unknown,
): GridDungeonTileKind[][] {
  return GRID_DUNGEON_ROUTES[parseGridDungeonRouteId(routeId)].layout;
}

export function gridDungeonRouteSummary(
  routeId: unknown,
): GridDungeonRouteSummary {
  const route = parseGridDungeonRouteId(routeId);
  const summary: GridDungeonRouteSummary = {
    routeId: route,
    expectedGold: 0,
    combatRooms: 0,
    eliteRooms: 0,
    trapRooms: 0,
    treasureRooms: 0,
    relicRooms: 0,
    fountainRooms: 0,
    materialRooms: 0,
    materialDepth: 0,
    avgMaterialDepth: 0,
    bossGold: gridDungeonRoomGold(route, "boss"),
  };
  for (const row of gridDungeonLayoutForRoute(route)) {
    for (const tile of row) {
      if (
        tile === "monster" ||
        tile === "elite" ||
        tile === "treasure" ||
        tile === "relic" ||
        tile === "boss"
      ) {
        summary.expectedGold += gridDungeonRoomGold(route, tile);
        summary.materialRooms += 1;
        summary.materialDepth += gridDungeonDropDepth(route, tile);
      }
      if (tile === "monster" || tile === "elite" || tile === "boss") {
        summary.combatRooms += 1;
      }
      if (tile === "elite") summary.eliteRooms += 1;
      else if (tile === "trap") summary.trapRooms += 1;
      else if (tile === "treasure") summary.treasureRooms += 1;
      else if (tile === "relic") summary.relicRooms += 1;
      else if (tile === "fountain") summary.fountainRooms += 1;
    }
  }
  summary.avgMaterialDepth =
    summary.materialRooms > 0
      ? Math.round(summary.materialDepth / summary.materialRooms)
      : 0;
  return summary;
}

export function isGridDungeonCombatTile(
  tile: GridDungeonTileKind,
): tile is "monster" | "elite" | "boss" {
  return tile === "monster" || tile === "elite" || tile === "boss";
}

function parsePositiveInt(raw: unknown, fallback: number): number {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function parseDropResult(raw: unknown): DropResult {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [id, amount] of Object.entries(raw as Record<string, unknown>)) {
    const n = Math.floor(Number(amount));
    if (Number.isFinite(n) && n > 0) out[id] = n;
  }
  return out;
}

function dropResultCount(drops: DropResult): number {
  return Object.values(drops).reduce<number>(
    (sum, amount) => sum + Math.max(0, Math.floor(Number(amount) || 0)),
    0,
  );
}

function mergeDropResults(a: DropResult, b: DropResult): DropResult {
  const out: Record<string, number> = {};
  for (const [id, amount] of Object.entries(a)) {
    if (amount && amount > 0) out[id] = amount;
  }
  for (const [id, amount] of Object.entries(b)) {
    if (!amount || amount <= 0) continue;
    out[id] = (out[id] ?? 0) + amount;
  }
  return out;
}

function parseSupporterSnapshot(raw: unknown): GridDungeonSupporterSnapshot | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Partial<GridDungeonSupporterSnapshot>;
  if (typeof r.userId !== "string" || !r.userId) return null;
  return {
    userId: r.userId,
    name: typeof r.name === "string" && r.name ? r.name : "모험가",
    level: Math.max(1, parsePositiveInt(r.level, 1)),
    job: typeof r.job === "string" && r.job ? r.job : "모험가",
    supportRole: parseGridDungeonSupportRole(r.supportRole),
    maxHp: Math.max(1, parsePositiveInt(r.maxHp, 1)),
    maxMp: parsePositiveInt(r.maxMp, 0),
    mp: parsePositiveInt(r.mp, parsePositiveInt(r.maxMp, 0)),
    atk: Math.max(1, parsePositiveInt(r.atk, 1)),
    magicAtk: parsePositiveInt(r.magicAtk, 0),
    def: parsePositiveInt(r.def, 0),
    spd: Math.max(1, parsePositiveInt(r.spd, 1)),
    healMult:
      typeof r.healMult === "number" && Number.isFinite(r.healMult)
        ? Math.max(0, r.healMult)
        : 1,
    element: r.element ?? "neutral",
    skills: Array.isArray(r.skills)
      ? r.skills.filter((skill): skill is string => typeof skill === "string")
      : [],
    pattern: r.pattern,
    capturedAt: parsePositiveInt(r.capturedAt, Date.now()),
  };
}

export function parseGridDungeonDailyRewards(
  raw: unknown,
  now = Date.now(),
): GridDungeonDailyRewards {
  const today = gridDungeonDayKey(now);
  if (!raw || typeof raw !== "object") return { dayKey: today, claimed: 0 };
  const save = raw as Partial<GridDungeonDailyRewards>;
  if (save.dayKey !== today) return { dayKey: today, claimed: 0 };
  return { dayKey: today, claimed: parsePositiveInt(save.claimed, 0) };
}

export function gridDungeonRewardQuota(
  raw: unknown,
  now = Date.now(),
): GridDungeonRewardQuota {
  const daily = parseGridDungeonDailyRewards(raw, now);
  const limit = 3;
  const claimed = Math.min(limit, daily.claimed);
  return {
    dayKey: daily.dayKey,
    claimed,
    limit,
    remaining: Math.max(0, limit - claimed),
  };
}

export function parseGridDungeonHistory(raw: unknown): GridDungeonHistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const e = entry as Partial<GridDungeonHistoryEntry>;
      if (
        e.outcome !== "cleared" &&
        e.outcome !== "failed" &&
        e.outcome !== "abandoned"
      ) {
        return null;
      }
      return {
        id: typeof e.id === "string" && e.id ? e.id : `${e.outcome}:${e.at ?? 0}`,
        outcome: e.outcome,
        at: parsePositiveInt(e.at, 0),
        rewardGold: parsePositiveInt(e.rewardGold, 0),
        drops: parseDropResult(e.drops),
        materialCount:
          e.materialCount != null
            ? parsePositiveInt(e.materialCount, 0)
            : dropResultCount(parseDropResult(e.drops)),
        rewardLimited: e.rewardLimited === true,
        exploredTiles: parsePositiveInt(e.exploredTiles, 0),
        hp: parsePositiveInt(e.hp, 0),
        routeId: parseGridDungeonRouteId(e.routeId),
        supporterCount: parsePositiveInt(e.supporterCount, 0),
        bossReached: e.bossReached === true,
        combatCount: parsePositiveInt(e.combatCount, 0),
        totalCombatTurns: parsePositiveInt(e.totalCombatTurns, 0),
        durationMs: parsePositiveInt(e.durationMs, 0),
        message: typeof e.message === "string" ? e.message : "",
        detailReason:
          typeof e.detailReason === "string" && e.detailReason
            ? e.detailReason
            : typeof e.message === "string"
              ? e.message
              : "",
      };
    })
    .filter((entry): entry is GridDungeonHistoryEntry => entry != null)
    .sort((a, b) => b.at - a.at)
    .slice(0, 10);
}

export function appendGridDungeonHistory(
  raw: unknown,
  entry: GridDungeonHistoryEntry,
): GridDungeonHistoryEntry[] {
  return [entry, ...parseGridDungeonHistory(raw)]
    .sort((a, b) => b.at - a.at)
    .slice(0, 10);
}

export function rollGridDungeonDrops(
  tile: GridDungeonTileKind,
  rng: () => number = Math.random,
  routeId: unknown = "balanced",
): DropResult {
  return rollGuildWorkshopMaterialDrops(gridDungeonDropDepth(routeId, tile), rng);
}

export function gridDungeonMovePreview(
  run: Pick<GridDungeonRun, "pos" | "clearedEvents"> & {
    routeId?: GridDungeonRouteId;
  },
  dir: GridDungeonMoveDir,
):
  | {
      dir: GridDungeonMoveDir;
      available: true;
      next: { x: number; y: number };
      key: string;
      tile: Exclude<GridDungeonTileKind, "wall">;
      cleared: boolean;
    }
  | {
      dir: GridDungeonMoveDir;
      available: false;
      next: { x: number; y: number };
      key: string;
      tile: GridDungeonTileKind | null;
      reason: "outside" | "wall";
    } {
  const delta = GRID_DUNGEON_MOVE_DELTAS[dir];
  const next = { x: run.pos.x + delta.x, y: run.pos.y + delta.y };
  const key = gridDungeonKey(next.x, next.y);
  const tile = gridDungeonTileAt(
    next.x,
    next.y,
    gridDungeonLayoutForRoute(run.routeId),
  );
  if (!tile) return { dir, available: false, next, key, tile, reason: "outside" };
  if (tile === "wall") {
    return { dir, available: false, next, key, tile, reason: "wall" };
  }
  return {
    dir,
    available: true,
    next,
    key,
    tile,
    cleared: run.clearedEvents.includes(key),
  };
}

export function revealAround(
  x: number,
  y: number,
  prev: string[] = [],
  layout: GridDungeonTileKind[][] = GRID_DUNGEON_LAYOUT,
): string[] {
  const revealed = new Set(prev);
  for (const [dx, dy] of [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const nx = x + dx;
    const ny = y + dy;
    if (gridDungeonTileAt(nx, ny, layout)) revealed.add(gridDungeonKey(nx, ny));
  }
  return [...revealed].sort();
}

export function createGridDungeonRun(
  now = Date.now(),
  _rng: () => number = Math.random,
  supporters: GridDungeonSupporterSnapshot[] = [],
  frontlineId?: string,
  routeId: GridDungeonRouteId = "balanced",
  maxHp: number = GRID_DUNGEON_MAX_HP,
  hp: number = maxHp,
): GridDungeonRun {
  const layout = gridDungeonLayoutForRoute(routeId);
  const startKey = gridDungeonKey(GRID_DUNGEON_START.x, GRID_DUNGEON_START.y);
  const expeditionMaxHp = Math.max(1, Math.floor(maxHp));
  const initialHp = Number.isFinite(hp) ? hp : expeditionMaxHp;
  return {
    id: GRID_DUNGEON_ENTRANCE.id,
    routeId,
    status: "active",
    pos: { ...GRID_DUNGEON_START },
    hp: Math.max(0, Math.min(expeditionMaxHp, Math.floor(initialHp))),
    maxHp: expeditionMaxHp,
    pendingGold: 0,
    pendingDrops: {},
    bossDefeated: false,
    supporters,
    ...(frontlineId ? { frontlineId } : {}),
    visited: [startKey],
    revealed: revealAround(
      GRID_DUNGEON_START.x,
      GRID_DUNGEON_START.y,
      [],
      layout,
    ),
    clearedEvents: [startKey],
    combatCount: 0,
    totalCombatTurns: 0,
    lastMessage: "낡은 지하 유적에 들어섰습니다.",
    startedAt: now,
    updatedAt: now,
  };
}

export function withGridDungeonLayout(
  run: GridDungeonRun | null,
): GridDungeonPublicRun | null {
  return run ? { ...run, layout: gridDungeonLayoutForRoute(run.routeId) } : null;
}

export function parseGridDungeonRun(raw: unknown): GridDungeonRun | null {
  if (!raw || typeof raw !== "object") return null;
  const run = raw as Partial<GridDungeonRun>;
  const status = run.status;
  if (
    status !== "active" &&
    status !== "cleared" &&
    status !== "claimed" &&
    status !== "failed"
  ) {
    return null;
  }
  const routeId = parseGridDungeonRouteId(run.routeId);
  const x = Number(run.pos?.x);
  const y = Number(run.pos?.y);
  if (
    !Number.isInteger(x) ||
    !Number.isInteger(y) ||
    !gridDungeonTileAt(x, y, gridDungeonLayoutForRoute(routeId))
  ) {
    return null;
  }
  const now = Date.now();
  const maxHp = Math.max(
    1,
    Math.floor(Number(run.maxHp) || GRID_DUNGEON_MAX_HP),
  );
  const hp = Math.max(
    0,
    Math.min(maxHp, Math.floor(Number(run.hp) || 0)),
  );
  return {
    id: typeof run.id === "string" ? run.id : GRID_DUNGEON_ENTRANCE.id,
    routeId,
    status,
    pos: { x, y },
    hp,
    maxHp,
    pendingGold: Math.max(0, Math.floor(Number(run.pendingGold) || 0)),
    pendingDrops: parseDropResult(run.pendingDrops),
    bossDefeated: run.bossDefeated === true,
    supporters: Array.isArray(run.supporters)
      ? run.supporters
          .map(parseSupporterSnapshot)
          .filter((s): s is GridDungeonSupporterSnapshot => s != null)
      : [],
    ...(typeof run.frontlineId === "string" ? { frontlineId: run.frontlineId } : {}),
    visited: Array.isArray(run.visited)
      ? run.visited.filter((v): v is string => typeof v === "string")
      : [],
    revealed: Array.isArray(run.revealed)
      ? run.revealed.filter((v): v is string => typeof v === "string")
      : revealAround(x, y, [], gridDungeonLayoutForRoute(routeId)),
    clearedEvents: Array.isArray(run.clearedEvents)
      ? run.clearedEvents.filter((v): v is string => typeof v === "string")
      : [],
    combatCount: parsePositiveInt(run.combatCount, 0),
    totalCombatTurns: parsePositiveInt(run.totalCombatTurns, 0),
    ...(run.lastCombat && typeof run.lastCombat === "object"
      ? { lastCombat: run.lastCombat as GridDungeonResolvedCombat["summary"] }
      : {}),
    lastMessage:
      typeof run.lastMessage === "string" ? run.lastMessage : "탐험 중입니다.",
    startedAt: Math.max(0, Math.floor(Number(run.startedAt) || now)),
    updatedAt: Math.max(0, Math.floor(Number(run.updatedAt) || now)),
    ...(typeof run.claimedAt === "number" ? { claimedAt: run.claimedAt } : {}),
  };
}

export function gridDungeonTrapHpLoss(maxHp: number): number {
  return Math.max(1, Math.ceil(Math.max(1, maxHp) * GRID_DUNGEON_TRAP_HP_LOSS_PCT));
}

export function gridDungeonFountainHeal(maxHp: number): number {
  return Math.max(1, Math.ceil(Math.max(1, maxHp) * GRID_DUNGEON_FOUNTAIN_HEAL_PCT));
}

export function gridDungeonRoomGold(
  routeId: unknown,
  tile: GridDungeonTileKind,
): number {
  const route = parseGridDungeonRouteId(routeId);
  const routeOverride = GRID_DUNGEON_ROUTE_GOLD_OVERRIDES[route]?.[tile];
  if (routeOverride != null) return routeOverride;
  if (tile === "monster") return GRID_DUNGEON_ROOM_REWARDS.monster.gold;
  if (tile === "elite") return GRID_DUNGEON_ROOM_REWARDS.elite.gold;
  if (tile === "treasure") return GRID_DUNGEON_ROOM_REWARDS.treasure.gold;
  if (tile === "relic") return GRID_DUNGEON_ROOM_REWARDS.relic.gold;
  if (tile === "boss") return GRID_DUNGEON_ROOM_REWARDS.boss.gold;
  return 0;
}

export function gridDungeonDropDepth(
  routeId: unknown,
  tile: GridDungeonTileKind,
): number {
  const route = parseGridDungeonRouteId(routeId);
  return (
    GRID_DUNGEON_ROUTE_DROP_DEPTH_OVERRIDES[route]?.[tile] ??
    GRID_DUNGEON_BASE_DROP_DEPTH[tile] ??
    0
  );
}

export function gridDungeonBossReached(
  run: Pick<GridDungeonRun, "routeId" | "visited" | "clearedEvents" | "bossDefeated">,
): boolean {
  if (run.bossDefeated) return true;
  const reached = new Set([...run.visited, ...run.clearedEvents]);
  const layout = gridDungeonLayoutForRoute(run.routeId);
  for (let y = 0; y < layout.length; y += 1) {
    for (let x = 0; x < (layout[y]?.length ?? 0); x += 1) {
      if (layout[y]?.[x] === "boss" && reached.has(gridDungeonKey(x, y))) {
        return true;
      }
    }
  }
  return false;
}

export function moveGridDungeonRun(
  run: GridDungeonRun,
  dir: GridDungeonMoveDir,
  now = Date.now(),
  combat: GridDungeonResolvedCombat | null = null,
  eventDrops: DropResult = {},
):
  | { ok: true; run: GridDungeonRun }
  | { ok: false; error: "not_active" | "blocked" | "bad_direction" } {
  if (run.status !== "active") return { ok: false, error: "not_active" };
  const d = GRID_DUNGEON_MOVE_DELTAS[dir];
  if (!d) return { ok: false, error: "bad_direction" };
  const next = { x: run.pos.x + d.x, y: run.pos.y + d.y };
  const layout = gridDungeonLayoutForRoute(run.routeId);
  const tile = gridDungeonTileAt(next.x, next.y, layout);
  if (!tile || tile === "wall") return { ok: false, error: "blocked" };

  const key = gridDungeonKey(next.x, next.y);
  const visited = new Set(run.visited);
  const clearedEvents = new Set(run.clearedEvents);
  visited.add(key);

  let hp = run.hp;
  let pendingGold = run.pendingGold;
  let pendingDrops = run.pendingDrops ?? {};
  let bossDefeated = run.bossDefeated;
  let status: GridDungeonStatus = run.status;
  let message = "어둠 속으로 한 칸 더 나아갔습니다.";
  let lastCombat = run.lastCombat;
  let combatCount = run.combatCount;
  let totalCombatTurns = run.totalCombatTurns;

  if (!clearedEvents.has(key)) {
    clearedEvents.add(key);
    if (combat && isGridDungeonCombatTile(tile)) {
      hp = Math.max(0, Math.min(run.maxHp, combat.summary.playerHpAfter));
      pendingGold += combat.rewardGold;
      pendingDrops = mergeDropResults(pendingDrops, combat.drops);
      lastCombat = combat.summary;
      combatCount += 1;
      totalCombatTurns += Math.max(0, Math.floor(combat.summary.turns));
      message = combat.message;
      if (combat.outcome === "lose") {
        hp = 0;
      } else if (tile === "boss") {
        bossDefeated = true;
      }
    } else if (tile === "monster") {
      const rewardGold = gridDungeonRoomGold(run.routeId, tile);
      hp = Math.max(0, hp - GRID_DUNGEON_ROOM_REWARDS.monster.hpLoss);
      pendingGold += rewardGold;
      pendingDrops = mergeDropResults(pendingDrops, eventDrops);
      message = `유적 경비병을 쓰러뜨리고 ${rewardGold.toLocaleString()}G를 챙겼습니다.`;
    } else if (tile === "elite") {
      const rewardGold = gridDungeonRoomGold(run.routeId, tile);
      hp = Math.max(0, hp - GRID_DUNGEON_ROOM_REWARDS.elite.hpLoss);
      pendingGold += rewardGold;
      pendingDrops = mergeDropResults(pendingDrops, eventDrops);
      message = `정예 수문장을 돌파하고 ${rewardGold.toLocaleString()}G를 확보했습니다.`;
    } else if (tile === "treasure") {
      const rewardGold = gridDungeonRoomGold(run.routeId, tile);
      pendingGold += rewardGold;
      pendingDrops = mergeDropResults(pendingDrops, eventDrops);
      message = `오래된 보물상자에서 ${rewardGold.toLocaleString()}G를 발견했습니다.`;
    } else if (tile === "trap") {
      const hpLoss = gridDungeonTrapHpLoss(run.maxHp);
      hp = Math.max(0, hp - hpLoss);
      message = `숨은 함정을 밟아 HP ${hpLoss.toLocaleString()}을 잃었습니다.`;
    } else if (tile === "relic") {
      const rewardGold = gridDungeonRoomGold(run.routeId, tile);
      pendingGold += rewardGold;
      pendingDrops = mergeDropResults(pendingDrops, eventDrops);
      message = `고대 유물에서 ${rewardGold.toLocaleString()}G와 재료 흔적을 확보했습니다.`;
    } else if (tile === "fountain") {
      const healed = Math.min(
        run.maxHp - hp,
        gridDungeonFountainHeal(run.maxHp),
      );
      hp = Math.min(run.maxHp, hp + Math.max(0, healed));
      message = `맑은 샘물을 마셔 HP ${Math.max(0, healed).toLocaleString()}을 회복했습니다.`;
    } else if (tile === "boss") {
      const rewardGold = gridDungeonRoomGold(run.routeId, tile);
      hp = Math.max(0, hp - GRID_DUNGEON_ROOM_REWARDS.boss.hpLoss);
      pendingGold += rewardGold;
      bossDefeated = true;
      message = "유적의 파수꾼을 쓰러뜨렸습니다. 출구가 열렸습니다.";
    }
  } else if (tile === "exit" && bossDefeated) {
    status = "cleared";
    message = "출구에 도착했습니다. 보상을 정산할 수 있습니다.";
  }

  if (tile === "exit" && bossDefeated) {
    status = "cleared";
    message = "출구에 도착했습니다. 보상을 정산할 수 있습니다.";
  }
  if (hp <= 0) {
    status = "failed";
    pendingGold = 0;
    message = "탐험 중 쓰러졌습니다. 이번 탐험 보상은 잃었습니다.";
  }

  return {
    ok: true,
    run: {
      ...run,
      status,
      pos: next,
      hp,
      pendingGold,
      pendingDrops: status === "failed" ? {} : pendingDrops,
      bossDefeated,
      visited: [...visited].sort(),
      revealed: revealAround(next.x, next.y, run.revealed, layout),
      clearedEvents: [...clearedEvents].sort(),
      combatCount,
      totalCombatTurns,
      ...(lastCombat ? { lastCombat } : {}),
      lastMessage: message,
      updatedAt: now,
    },
  };
}
