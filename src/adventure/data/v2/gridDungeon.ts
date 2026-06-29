export const GRID_DUNGEON_SAVE_KEY = "grid-dungeon.v2" as const;
export const GRID_DUNGEON_DAILY_REWARDS_KEY =
  "grid-dungeon-daily-rewards.v2" as const;
export const GRID_DUNGEON_HISTORY_KEY = "grid-dungeon-history.v2" as const;
export const GRID_DUNGEON_DAILY_REWARD_LIMIT = 3;
export const GRID_DUNGEON_HISTORY_LIMIT = 10;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export const GRID_DUNGEON_ENTRANCE = {
  id: "old_ruins",
  name: "낡은 지하 유적",
  col: 3,
  row: 2,
} as const;

export const GRID_DUNGEON_SIZE = 5;
export const GRID_DUNGEON_MAX_HP = 10;

export type GridDungeonTileKind =
  | "start"
  | "empty"
  | "wall"
  | "monster"
  | "elite"
  | "treasure"
  | "fountain"
  | "boss"
  | "exit";

export type GridDungeonStatus = "active" | "cleared" | "claimed" | "failed";

export type GridDungeonCombatOutcome = "win" | "lose";

export type GridDungeonCombatSummary = {
  enemyName: string;
  outcome: GridDungeonCombatOutcome;
  turns: number;
  hpLost: number;
  playerHpBefore: number;
  playerHpAfter: number;
  playerMaxHp: number;
  enemyHp: number;
  enemyMaxHp: number;
  rewardGold: number;
  log: string[];
};

export type GridDungeonResolvedCombat = {
  outcome: GridDungeonCombatOutcome;
  hpLost: number;
  rewardGold: number;
  message: string;
  summary: GridDungeonCombatSummary;
};

export type GridDungeonRun = {
  id: string;
  status: GridDungeonStatus;
  pos: { x: number; y: number };
  hp: number;
  pendingGold: number;
  bossDefeated: boolean;
  visited: string[];
  revealed: string[];
  clearedEvents: string[];
  lastMessage: string;
  lastCombat?: GridDungeonCombatSummary;
  startedAt: number;
  updatedAt: number;
  claimedAt?: number;
};

export type GridDungeonPublicRun = GridDungeonRun & {
  layout: GridDungeonTileKind[][];
};

export type GridDungeonDailyRewards = {
  dayKey: string;
  claimed: number;
};

export type GridDungeonRewardQuota = {
  dayKey: string;
  limit: number;
  claimed: number;
  remaining: number;
};

export type GridDungeonHistoryOutcome = "cleared" | "failed" | "abandoned";

export type GridDungeonHistoryEntry = {
  id: string;
  outcome: GridDungeonHistoryOutcome;
  at: number;
  rewardGold: number;
  exploredTiles: number;
  hp: number;
  message: string;
};

export type GridDungeonHistory = {
  entries: GridDungeonHistoryEntry[];
};

export const GRID_DUNGEON_LAYOUT: GridDungeonTileKind[][] = [
  ["treasure", "empty", "boss", "exit", "treasure"],
  ["wall", "empty", "wall", "empty", "wall"],
  ["monster", "empty", "fountain", "empty", "elite"],
  ["empty", "wall", "monster", "wall", "empty"],
  ["treasure", "empty", "start", "empty", "monster"],
];

export const GRID_DUNGEON_START = { x: 2, y: 4 } as const;

export function gridDungeonKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function gridDungeonDayKey(now = Date.now()): string {
  return new Date(now + KST_OFFSET_MS).toISOString().slice(0, 10);
}

export function parseGridDungeonDailyRewards(
  raw: unknown,
  now = Date.now(),
): GridDungeonDailyRewards {
  const today = gridDungeonDayKey(now);
  if (!raw || typeof raw !== "object") return { dayKey: today, claimed: 0 };
  const save = raw as Partial<GridDungeonDailyRewards>;
  const dayKey = typeof save.dayKey === "string" ? save.dayKey : today;
  if (dayKey !== today) return { dayKey: today, claimed: 0 };
  const claimed = Math.max(0, Math.floor(Number(save.claimed) || 0));
  return { dayKey, claimed };
}

export function gridDungeonRewardQuota(
  raw: unknown,
  now = Date.now(),
): GridDungeonRewardQuota {
  const daily = parseGridDungeonDailyRewards(raw, now);
  const claimed = Math.min(GRID_DUNGEON_DAILY_REWARD_LIMIT, daily.claimed);
  return {
    dayKey: daily.dayKey,
    limit: GRID_DUNGEON_DAILY_REWARD_LIMIT,
    claimed,
    remaining: Math.max(0, GRID_DUNGEON_DAILY_REWARD_LIMIT - claimed),
  };
}

function parseHistoryOutcome(raw: unknown): GridDungeonHistoryOutcome | null {
  return raw === "cleared" || raw === "failed" || raw === "abandoned"
    ? raw
    : null;
}

export function parseGridDungeonHistory(raw: unknown): GridDungeonHistory {
  if (!raw || typeof raw !== "object") return { entries: [] };
  const entriesRaw = (raw as Partial<GridDungeonHistory>).entries;
  if (!Array.isArray(entriesRaw)) return { entries: [] };
  const entries = entriesRaw
    .map((entry): GridDungeonHistoryEntry | null => {
      if (!entry || typeof entry !== "object") return null;
      const e = entry as Partial<GridDungeonHistoryEntry>;
      const outcome = parseHistoryOutcome(e.outcome);
      if (!outcome) return null;
      const at = Math.max(0, Math.floor(Number(e.at) || 0));
      if (at <= 0) return null;
      return {
        id: typeof e.id === "string" ? e.id : `${outcome}:${at}`,
        outcome,
        at,
        rewardGold: Math.max(0, Math.floor(Number(e.rewardGold) || 0)),
        exploredTiles: Math.max(0, Math.floor(Number(e.exploredTiles) || 0)),
        hp: Math.max(0, Math.min(GRID_DUNGEON_MAX_HP, Math.floor(Number(e.hp) || 0))),
        message: typeof e.message === "string" ? e.message : "",
      };
    })
    .filter((entry): entry is GridDungeonHistoryEntry => entry != null)
    .sort((a, b) => b.at - a.at)
    .slice(0, GRID_DUNGEON_HISTORY_LIMIT);
  return { entries };
}

export function appendGridDungeonHistory(
  raw: unknown,
  entry: GridDungeonHistoryEntry,
): GridDungeonHistory {
  const history = parseGridDungeonHistory(raw);
  return {
    entries: [entry, ...history.entries]
      .sort((a, b) => b.at - a.at)
      .slice(0, GRID_DUNGEON_HISTORY_LIMIT),
  };
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
  return GRID_DUNGEON_LAYOUT[y]?.[x] ?? null;
}

export function isGridDungeonCombatTile(tile: GridDungeonTileKind): boolean {
  return tile === "monster" || tile === "elite" || tile === "boss";
}

export function revealAround(x: number, y: number, prev: string[] = []): string[] {
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
    if (gridDungeonTileAt(nx, ny)) revealed.add(gridDungeonKey(nx, ny));
  }
  return [...revealed].sort();
}

export function createGridDungeonRun(now = Date.now()): GridDungeonRun {
  const startKey = gridDungeonKey(GRID_DUNGEON_START.x, GRID_DUNGEON_START.y);
  return {
    id: GRID_DUNGEON_ENTRANCE.id,
    status: "active",
    pos: { ...GRID_DUNGEON_START },
    hp: GRID_DUNGEON_MAX_HP,
    pendingGold: 0,
    bossDefeated: false,
    visited: [startKey],
    revealed: revealAround(GRID_DUNGEON_START.x, GRID_DUNGEON_START.y),
    clearedEvents: [startKey],
    lastMessage: "낡은 지하 유적에 들어섰습니다.",
    startedAt: now,
    updatedAt: now,
  };
}

export function withGridDungeonLayout(
  run: GridDungeonRun | null,
): GridDungeonPublicRun | null {
  return run ? { ...run, layout: GRID_DUNGEON_LAYOUT } : null;
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
  const x = Number(run.pos?.x);
  const y = Number(run.pos?.y);
  if (!Number.isInteger(x) || !Number.isInteger(y) || !gridDungeonTileAt(x, y)) {
    return null;
  }
  const now = Date.now();
  const parsed: GridDungeonRun = {
    id: typeof run.id === "string" ? run.id : GRID_DUNGEON_ENTRANCE.id,
    status,
    pos: { x, y },
    hp: Math.max(0, Math.min(GRID_DUNGEON_MAX_HP, Math.floor(Number(run.hp) || 0))),
    pendingGold: Math.max(0, Math.floor(Number(run.pendingGold) || 0)),
    bossDefeated: run.bossDefeated === true,
    visited: Array.isArray(run.visited)
      ? run.visited.filter((v): v is string => typeof v === "string")
      : [],
    revealed: Array.isArray(run.revealed)
      ? run.revealed.filter((v): v is string => typeof v === "string")
      : revealAround(x, y),
    clearedEvents: Array.isArray(run.clearedEvents)
      ? run.clearedEvents.filter((v): v is string => typeof v === "string")
      : [],
    lastMessage:
      typeof run.lastMessage === "string" ? run.lastMessage : "탐험 중입니다.",
    startedAt: Math.max(0, Math.floor(Number(run.startedAt) || now)),
    updatedAt: Math.max(0, Math.floor(Number(run.updatedAt) || now)),
    ...(typeof run.claimedAt === "number" ? { claimedAt: run.claimedAt } : {}),
  };
  const lastCombat = parseGridDungeonCombatSummary(run.lastCombat);
  return lastCombat ? { ...parsed, lastCombat } : parsed;
}

function parseCombatOutcome(raw: unknown): GridDungeonCombatOutcome | null {
  return raw === "win" || raw === "lose" ? raw : null;
}

function parseGridDungeonCombatSummary(
  raw: unknown,
): GridDungeonCombatSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<GridDungeonCombatSummary>;
  const outcome = parseCombatOutcome(r.outcome);
  if (!outcome) return null;
  const enemyName = typeof r.enemyName === "string" ? r.enemyName : "";
  if (!enemyName) return null;
  const log = Array.isArray(r.log)
    ? r.log.filter((line): line is string => typeof line === "string").slice(-6)
    : [];
  return {
    enemyName,
    outcome,
    turns: Math.max(0, Math.floor(Number(r.turns) || 0)),
    hpLost: Math.max(0, Math.floor(Number(r.hpLost) || 0)),
    playerHpBefore: Math.max(0, Math.floor(Number(r.playerHpBefore) || 0)),
    playerHpAfter: Math.max(0, Math.floor(Number(r.playerHpAfter) || 0)),
    playerMaxHp: Math.max(0, Math.floor(Number(r.playerMaxHp) || 0)),
    enemyHp: Math.max(0, Math.floor(Number(r.enemyHp) || 0)),
    enemyMaxHp: Math.max(0, Math.floor(Number(r.enemyMaxHp) || 0)),
    rewardGold: Math.max(0, Math.floor(Number(r.rewardGold) || 0)),
    log,
  };
}

export type GridDungeonMoveDir = "up" | "down" | "left" | "right";

export function moveGridDungeonRun(
  run: GridDungeonRun,
  dir: GridDungeonMoveDir,
  now = Date.now(),
  combat: GridDungeonResolvedCombat | null = null,
):
  | { ok: true; run: GridDungeonRun }
  | { ok: false; error: "not_active" | "blocked" | "bad_direction" } {
  if (run.status !== "active") return { ok: false, error: "not_active" };
  const delta: Record<GridDungeonMoveDir, { x: number; y: number }> = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };
  const d = delta[dir];
  if (!d) return { ok: false, error: "bad_direction" };
  const next = { x: run.pos.x + d.x, y: run.pos.y + d.y };
  const tile = gridDungeonTileAt(next.x, next.y);
  if (!tile || tile === "wall") return { ok: false, error: "blocked" };

  const key = gridDungeonKey(next.x, next.y);
  const visited = new Set(run.visited);
  const clearedEvents = new Set(run.clearedEvents);
  visited.add(key);

  let hp = run.hp;
  let pendingGold = run.pendingGold;
  let bossDefeated = run.bossDefeated;
  let status: GridDungeonStatus = run.status;
  let message = "어둠 속으로 한 칸 더 나아갔습니다.";
  let lastCombat: GridDungeonCombatSummary | undefined;

  if (!clearedEvents.has(key)) {
    clearedEvents.add(key);
    if (tile === "monster") {
      const resolved =
        combat ??
        fallbackGridDungeonCombat("유적 경비병", 2, 700, run.hp);
      hp = Math.max(0, hp - resolved.hpLost);
      pendingGold += resolved.rewardGold;
      message = resolved.message;
      lastCombat = resolved.summary;
    } else if (tile === "elite") {
      const resolved =
        combat ??
        fallbackGridDungeonCombat("정예 수문장", 3, 1_500, run.hp);
      hp = Math.max(0, hp - resolved.hpLost);
      pendingGold += resolved.rewardGold;
      message = resolved.message;
      lastCombat = resolved.summary;
    } else if (tile === "treasure") {
      pendingGold += 1_000;
      message = "오래된 보물상자에서 1,000G를 발견했습니다.";
    } else if (tile === "fountain") {
      hp = Math.min(GRID_DUNGEON_MAX_HP, hp + 4);
      message = "맑은 샘물을 마셔 체력을 회복했습니다.";
    } else if (tile === "boss") {
      const resolved =
        combat ??
        fallbackGridDungeonCombat("유적의 파수꾼", 4, 4_000, run.hp);
      hp = Math.max(0, hp - resolved.hpLost);
      pendingGold += resolved.rewardGold;
      bossDefeated = resolved.outcome === "win";
      message = resolved.message;
      lastCombat = resolved.summary;
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

  const nextRun: GridDungeonRun = {
    ...run,
    status,
    pos: next,
    hp,
    pendingGold,
    bossDefeated,
    visited: [...visited].sort(),
    revealed: revealAround(next.x, next.y, run.revealed),
    clearedEvents: [...clearedEvents].sort(),
    lastMessage: message,
    updatedAt: now,
  };
  if (lastCombat) nextRun.lastCombat = lastCombat;
  else delete nextRun.lastCombat;

  return {
    ok: true,
    run: nextRun,
  };
}

function fallbackGridDungeonCombat(
  enemyName: string,
  hpLost: number,
  rewardGold: number,
  playerHpBefore: number,
): GridDungeonResolvedCombat {
  return {
    outcome: "win",
    hpLost,
    rewardGold,
    message:
      enemyName === "유적의 파수꾼"
        ? "유적의 파수꾼을 쓰러뜨렸습니다. 출구가 열렸습니다."
        : `${enemyName}을(를) 쓰러뜨리고 ${rewardGold.toLocaleString()}G를 챙겼습니다.`,
    summary: {
      enemyName,
      outcome: "win",
      turns: 1,
      hpLost,
      playerHpBefore,
      playerHpAfter: Math.max(0, playerHpBefore - hpLost),
      playerMaxHp: GRID_DUNGEON_MAX_HP,
      enemyHp: 0,
      enemyMaxHp: 1,
      rewardGold,
      log: [],
    },
  };
}
