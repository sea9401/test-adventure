export const GRID_DUNGEON_SAVE_KEY = "grid-dungeon.v2" as const;

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
  startedAt: number;
  updatedAt: number;
  claimedAt?: number;
};

export type GridDungeonPublicRun = GridDungeonRun & {
  layout: GridDungeonTileKind[][];
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
  return {
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
}

export type GridDungeonMoveDir = "up" | "down" | "left" | "right";

export function moveGridDungeonRun(
  run: GridDungeonRun,
  dir: GridDungeonMoveDir,
  now = Date.now(),
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

  if (!clearedEvents.has(key)) {
    clearedEvents.add(key);
    if (tile === "monster") {
      hp = Math.max(0, hp - 2);
      pendingGold += 700;
      message = "유적 경비병을 쓰러뜨리고 700G를 챙겼습니다.";
    } else if (tile === "elite") {
      hp = Math.max(0, hp - 3);
      pendingGold += 1_500;
      message = "정예 수문장을 돌파하고 1,500G를 확보했습니다.";
    } else if (tile === "treasure") {
      pendingGold += 1_000;
      message = "오래된 보물상자에서 1,000G를 발견했습니다.";
    } else if (tile === "fountain") {
      hp = Math.min(GRID_DUNGEON_MAX_HP, hp + 4);
      message = "맑은 샘물을 마셔 체력을 회복했습니다.";
    } else if (tile === "boss") {
      hp = Math.max(0, hp - 4);
      pendingGold += 4_000;
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
      bossDefeated,
      visited: [...visited].sort(),
      revealed: revealAround(next.x, next.y, run.revealed),
      clearedEvents: [...clearedEvents].sort(),
      lastMessage: message,
      updatedAt: now,
    },
  };
}
