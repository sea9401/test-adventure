import {
  mergeDrops,
  type DropResult,
} from "@/adventure/data/v2/dungeonDrops";
import { ENHANCE_STONE_MATERIAL_ID } from "@/adventure/data/v2/v2Enhance";
import { REFORGE_STONE_MATERIAL_ID } from "@/adventure/data/v2/v2EquipVariance";
import { SETTLEMENT_MATERIAL_ID } from "@/adventure/data/v2/settlementMaterials";
import { SUMMON_SCROLL_MATERIAL_ID } from "@/adventure/data/v2/coopBosses";
import {
  parseCombatPattern,
  type V2CombatPattern,
} from "@/adventure/v2/combat/combatPattern";

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

export const GRID_DUNGEON_SUPPORT_ROLES = [
  "dealer",
  "healer",
  "tank",
  "support",
] as const;

export type GridDungeonSupportRole =
  (typeof GRID_DUNGEON_SUPPORT_ROLES)[number];

export const GRID_DUNGEON_SUPPORT_ROLE_LABEL: Record<
  GridDungeonSupportRole,
  string
> = {
  dealer: "공격형",
  healer: "회복형",
  tank: "방어형",
  support: "보조형",
};

export function parseGridDungeonSupportRole(
  raw: unknown,
): GridDungeonSupportRole | null {
  return GRID_DUNGEON_SUPPORT_ROLES.includes(raw as GridDungeonSupportRole)
    ? (raw as GridDungeonSupportRole)
    : null;
}

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

export type GridDungeonCombatPartyMember = {
  id: string;
  name: string;
  role: "main" | "supporter";
  hpAfter: number;
  maxHp: number;
  damageDealt: number;
  damageTaken: number;
  healingDone: number;
  skillUses: Record<string, number>;
};

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
  party?: GridDungeonCombatPartyMember[];
  log: string[];
};

export type GridDungeonResolvedCombat = {
  outcome: GridDungeonCombatOutcome;
  hpLost: number;
  rewardGold: number;
  drops?: DropResult;
  message: string;
  summary: GridDungeonCombatSummary;
};

export type GridDungeonSupporterSnapshot = {
  userId: string;
  name: string;
  level: number;
  job: string;
  maxHp: number;
  maxMp: number;
  mp: number;
  atk: number;
  magicAtk: number;
  def: number;
  spd: number;
  healMult: number;
  element: string;
  skills: string[];
  pattern: V2CombatPattern;
  capturedAt: number;
};

export type GridDungeonRun = {
  id: string;
  status: GridDungeonStatus;
  layout: GridDungeonTileKind[][];
  supporters: GridDungeonSupporterSnapshot[];
  pos: { x: number; y: number };
  hp: number;
  pendingGold: number;
  pendingDrops?: DropResult;
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

export type GridDungeonPublicRun = GridDungeonRun;

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
  drops?: DropResult;
  exploredTiles: number;
  hp: number;
  message: string;
};

export type GridDungeonHistory = {
  entries: GridDungeonHistoryEntry[];
};

function sanitizeGridDungeonSupporters(
  raw: unknown,
): GridDungeonSupporterSnapshot[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const supporters: GridDungeonSupporterSnapshot[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Partial<GridDungeonSupporterSnapshot>;
    const userId = typeof e.userId === "string" ? e.userId : "";
    if (!userId || seen.has(userId)) continue;
    seen.add(userId);
    supporters.push({
      userId,
      name: typeof e.name === "string" && e.name.trim() ? e.name.trim() : "모험가",
      level: Math.max(1, Math.floor(Number(e.level) || 1)),
      job: typeof e.job === "string" && e.job.trim() ? e.job.trim() : "모험가",
      maxHp: Math.max(1, Math.floor(Number(e.maxHp) || 1)),
      maxMp: Math.max(0, Math.floor(Number(e.maxMp) || 0)),
      mp: Math.max(0, Math.floor(Number(e.mp) || Number(e.maxMp) || 0)),
      atk: Math.max(0, Math.floor(Number(e.atk) || 0)),
      magicAtk: Math.max(0, Math.floor(Number(e.magicAtk) || 0)),
      def: Math.max(0, Math.floor(Number(e.def) || 0)),
      spd: Math.max(0, Math.floor(Number(e.spd) || 0)),
      healMult:
        typeof e.healMult === "number" && Number.isFinite(e.healMult)
          ? Math.max(0, e.healMult)
          : 1,
      element:
        typeof e.element === "string" && e.element.trim()
          ? e.element.trim()
          : "neutral",
      skills: Array.isArray(e.skills)
        ? e.skills.filter((id): id is string => typeof id === "string").slice(0, 16)
        : [],
      pattern: parseCombatPattern(e.pattern),
      capturedAt: Math.max(0, Math.floor(Number(e.capturedAt) || 0)),
    });
    if (supporters.length >= 2) break;
  }
  return supporters;
}

export const GRID_DUNGEON_LAYOUT: GridDungeonTileKind[][] = [
  ["treasure", "empty", "boss", "exit", "treasure"],
  ["wall", "empty", "wall", "empty", "wall"],
  ["monster", "empty", "fountain", "empty", "elite"],
  ["empty", "wall", "monster", "wall", "empty"],
  ["treasure", "empty", "start", "empty", "monster"],
];

export const GRID_DUNGEON_LAYOUT_TEMPLATES: GridDungeonTileKind[][][] = [
  GRID_DUNGEON_LAYOUT,
  [
    ["treasure", "empty", "elite", "empty", "treasure"],
    ["wall", "empty", "wall", "empty", "wall"],
    ["monster", "empty", "fountain", "empty", "boss"],
    ["empty", "wall", "monster", "wall", "exit"],
    ["treasure", "empty", "start", "empty", "monster"],
  ],
  [
    ["treasure", "wall", "boss", "exit", "treasure"],
    ["empty", "empty", "empty", "wall", "empty"],
    ["monster", "wall", "fountain", "empty", "elite"],
    ["empty", "wall", "monster", "wall", "empty"],
    ["treasure", "empty", "start", "empty", "monster"],
  ],
  [
    ["treasure", "empty", "elite", "empty", "exit"],
    ["wall", "empty", "wall", "empty", "boss"],
    ["monster", "empty", "fountain", "empty", "treasure"],
    ["empty", "wall", "monster", "wall", "empty"],
    ["monster", "empty", "start", "empty", "treasure"],
  ],
  [
    ["exit", "empty", "boss", "empty", "treasure"],
    ["empty", "wall", "empty", "wall", "empty"],
    ["elite", "empty", "fountain", "empty", "monster"],
    ["wall", "empty", "monster", "wall", "empty"],
    ["treasure", "empty", "start", "empty", "treasure"],
  ],
];

export const GRID_DUNGEON_START = { x: 2, y: 4 } as const;

type GridDungeonDropEvent = "monster" | "elite" | "boss" | "treasure";

type GridDungeonDropRule = {
  id: string;
  chance: number;
  amountMin: number;
  amountMax: number;
};

const GRID_DUNGEON_DROP_TABLE: Record<
  GridDungeonDropEvent,
  GridDungeonDropRule[]
> = {
  monster: [
    { id: ENHANCE_STONE_MATERIAL_ID.red, chance: 0.12, amountMin: 1, amountMax: 1 },
    { id: ENHANCE_STONE_MATERIAL_ID.blue, chance: 0.08, amountMin: 1, amountMax: 1 },
  ],
  elite: [
    { id: ENHANCE_STONE_MATERIAL_ID.red, chance: 0.24, amountMin: 1, amountMax: 1 },
    { id: ENHANCE_STONE_MATERIAL_ID.blue, chance: 0.18, amountMin: 1, amountMax: 1 },
    { id: REFORGE_STONE_MATERIAL_ID.basic, chance: 0.08, amountMin: 1, amountMax: 1 },
  ],
  boss: [
    { id: ENHANCE_STONE_MATERIAL_ID.red, chance: 0.45, amountMin: 1, amountMax: 2 },
    { id: ENHANCE_STONE_MATERIAL_ID.blue, chance: 0.35, amountMin: 1, amountMax: 2 },
    { id: REFORGE_STONE_MATERIAL_ID.basic, chance: 0.18, amountMin: 1, amountMax: 1 },
    { id: REFORGE_STONE_MATERIAL_ID.high, chance: 0.04, amountMin: 1, amountMax: 1 },
    { id: SUMMON_SCROLL_MATERIAL_ID, chance: 0.08, amountMin: 1, amountMax: 1 },
  ],
  treasure: [
    { id: ENHANCE_STONE_MATERIAL_ID.blue, chance: 0.35, amountMin: 1, amountMax: 1 },
    { id: REFORGE_STONE_MATERIAL_ID.basic, chance: 0.08, amountMin: 1, amountMax: 1 },
    { id: SETTLEMENT_MATERIAL_ID.timber, chance: 0.12, amountMin: 1, amountMax: 2 },
    { id: SETTLEMENT_MATERIAL_ID.ironOre, chance: 0.12, amountMin: 1, amountMax: 2 },
  ],
};

export function gridDungeonKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function gridDungeonDayKey(now = Date.now()): string {
  return new Date(now + KST_OFFSET_MS).toISOString().slice(0, 10);
}

export function rollGridDungeonDrops(
  event: GridDungeonDropEvent,
  rng: () => number = Math.random,
): DropResult {
  const drops: DropResult = {};
  for (const rule of GRID_DUNGEON_DROP_TABLE[event]) {
    if (rng() >= rule.chance) continue;
    const span = rule.amountMax - rule.amountMin + 1;
    const amount = rule.amountMin + Math.floor(rng() * span);
    if (amount <= 0) continue;
    drops[rule.id] = (drops[rule.id] ?? 0) + amount;
  }
  return drops;
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
        drops: sanitizeGridDungeonDrops(e.drops),
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

function sanitizeGridDungeonLayout(raw: unknown): GridDungeonTileKind[][] {
  if (!Array.isArray(raw) || raw.length !== GRID_DUNGEON_SIZE) {
    return GRID_DUNGEON_LAYOUT;
  }
  const validKinds = new Set<GridDungeonTileKind>([
    "start",
    "empty",
    "wall",
    "monster",
    "elite",
    "treasure",
    "fountain",
    "boss",
    "exit",
  ]);
  const layout: GridDungeonTileKind[][] = [];
  for (const row of raw) {
    if (!Array.isArray(row) || row.length !== GRID_DUNGEON_SIZE) {
      return GRID_DUNGEON_LAYOUT;
    }
    const nextRow: GridDungeonTileKind[] = [];
    for (const cell of row) {
      if (typeof cell !== "string" || !validKinds.has(cell as GridDungeonTileKind)) {
        return GRID_DUNGEON_LAYOUT;
      }
      nextRow.push(cell as GridDungeonTileKind);
    }
    layout.push(nextRow);
  }
  if (layout[GRID_DUNGEON_START.y]?.[GRID_DUNGEON_START.x] !== "start") {
    return GRID_DUNGEON_LAYOUT;
  }
  return layout;
}

function randomGridDungeonLayout(rng: () => number): GridDungeonTileKind[][] {
  const index = Math.min(
    GRID_DUNGEON_LAYOUT_TEMPLATES.length - 1,
    Math.max(0, Math.floor(rng() * GRID_DUNGEON_LAYOUT_TEMPLATES.length)),
  );
  return GRID_DUNGEON_LAYOUT_TEMPLATES[index]?.map((row) => [...row]) ?? GRID_DUNGEON_LAYOUT;
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

export function isGridDungeonCombatTile(
  tile: GridDungeonTileKind,
): tile is "monster" | "elite" | "boss" {
  return tile === "monster" || tile === "elite" || tile === "boss";
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
  rng: () => number = Math.random,
  supporters: GridDungeonSupporterSnapshot[] = [],
): GridDungeonRun {
  const layout = randomGridDungeonLayout(rng);
  const startKey = gridDungeonKey(GRID_DUNGEON_START.x, GRID_DUNGEON_START.y);
  return {
    id: GRID_DUNGEON_ENTRANCE.id,
    status: "active",
    layout,
    supporters: sanitizeGridDungeonSupporters(supporters),
    pos: { ...GRID_DUNGEON_START },
    hp: GRID_DUNGEON_MAX_HP,
    pendingGold: 0,
    bossDefeated: false,
    visited: [startKey],
    revealed: revealAround(GRID_DUNGEON_START.x, GRID_DUNGEON_START.y, [], layout),
    clearedEvents: [startKey],
    lastMessage: "낡은 지하 유적에 들어섰습니다.",
    startedAt: now,
    updatedAt: now,
  };
}

export function withGridDungeonLayout(
  run: GridDungeonRun | null,
): GridDungeonPublicRun | null {
  return run ? { ...run, layout: sanitizeGridDungeonLayout(run.layout) } : null;
}

export function parseGridDungeonRun(raw: unknown): GridDungeonRun | null {
  if (!raw || typeof raw !== "object") return null;
  const run = raw as Partial<GridDungeonRun>;
  const layout = sanitizeGridDungeonLayout(run.layout);
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
  if (!Number.isInteger(x) || !Number.isInteger(y) || !gridDungeonTileAt(x, y, layout)) {
    return null;
  }
  const now = Date.now();
  const parsed: GridDungeonRun = {
    id: typeof run.id === "string" ? run.id : GRID_DUNGEON_ENTRANCE.id,
    status,
    layout,
    supporters: sanitizeGridDungeonSupporters(run.supporters),
    pos: { x, y },
    hp: Math.max(0, Math.min(GRID_DUNGEON_MAX_HP, Math.floor(Number(run.hp) || 0))),
    pendingGold: Math.max(0, Math.floor(Number(run.pendingGold) || 0)),
    pendingDrops: sanitizeGridDungeonDrops(run.pendingDrops),
    bossDefeated: run.bossDefeated === true,
    visited: Array.isArray(run.visited)
      ? run.visited.filter((v): v is string => typeof v === "string")
      : [],
    revealed: Array.isArray(run.revealed)
      ? run.revealed.filter((v): v is string => typeof v === "string")
      : revealAround(x, y, [], layout),
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
  if (!hasGridDungeonDrops(parsed.pendingDrops)) delete parsed.pendingDrops;
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
  const party = parseGridDungeonCombatParty(r.party);
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
    ...(party.length > 0 ? { party } : {}),
    log,
  };
}

function parseGridDungeonCombatParty(raw: unknown): GridDungeonCombatPartyMember[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry): GridDungeonCombatPartyMember | null => {
      if (!entry || typeof entry !== "object") return null;
      const e = entry as Partial<GridDungeonCombatPartyMember>;
      const id = typeof e.id === "string" ? e.id : "";
      const name = typeof e.name === "string" && e.name.trim() ? e.name.trim() : "";
      const role = e.role === "main" || e.role === "supporter" ? e.role : null;
      if (!id || !name || !role) return null;
      return {
        id,
        name,
        role,
        hpAfter: Math.max(0, Math.floor(Number(e.hpAfter) || 0)),
        maxHp: Math.max(1, Math.floor(Number(e.maxHp) || 1)),
        damageDealt: Math.max(0, Math.floor(Number(e.damageDealt) || 0)),
        damageTaken: Math.max(0, Math.floor(Number(e.damageTaken) || 0)),
        healingDone: Math.max(0, Math.floor(Number(e.healingDone) || 0)),
        skillUses: sanitizeGridDungeonSkillUses(e.skillUses),
      };
    })
    .filter((entry): entry is GridDungeonCombatPartyMember => entry != null)
    .slice(0, 3);
}

function sanitizeGridDungeonSkillUses(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, number> = {};
  for (const [name, countRaw] of Object.entries(raw as Record<string, unknown>)) {
    const trimmed = name.trim();
    const count = Math.max(0, Math.floor(Number(countRaw) || 0));
    if (trimmed && count > 0) out[trimmed] = count;
  }
  return out;
}

function sanitizeGridDungeonDrops(raw: unknown): DropResult {
  if (!raw || typeof raw !== "object") return {};
  const drops: DropResult = {};
  for (const [id, amountRaw] of Object.entries(raw as Record<string, unknown>)) {
    const amount = Math.max(0, Math.floor(Number(amountRaw) || 0));
    if (amount > 0) drops[id] = amount;
  }
  return drops;
}

function hasGridDungeonDrops(drops: DropResult | undefined): boolean {
  return Object.values(drops ?? {}).some((amount) => (amount ?? 0) > 0);
}

export type GridDungeonMoveDir = "up" | "down" | "left" | "right";

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
  const delta: Record<GridDungeonMoveDir, { x: number; y: number }> = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };
  const d = delta[dir];
  if (!d) return { ok: false, error: "bad_direction" };
  const layout = sanitizeGridDungeonLayout(run.layout);
  const next = { x: run.pos.x + d.x, y: run.pos.y + d.y };
  const tile = gridDungeonTileAt(next.x, next.y, layout);
  if (!tile || tile === "wall") return { ok: false, error: "blocked" };

  const key = gridDungeonKey(next.x, next.y);
  const visited = new Set(run.visited);
  const clearedEvents = new Set(run.clearedEvents);
  visited.add(key);

  let hp = run.hp;
  let pendingGold = run.pendingGold;
  let pendingDrops = sanitizeGridDungeonDrops(run.pendingDrops);
  let bossDefeated = run.bossDefeated;
  let status: GridDungeonStatus = run.status;
  let message = "어둠 속으로 한 칸 더 나아갔습니다.";
  let lastCombat: GridDungeonCombatSummary | undefined;

  if (!clearedEvents.has(key)) {
    clearedEvents.add(key);
    if (tile === "monster") {
      const resolved =
        combat ??
        fallbackGridDungeonCombat("유적 경비병", 2, 0, run.hp);
      hp = Math.max(0, hp - resolved.hpLost);
      pendingGold += resolved.rewardGold;
      pendingDrops = mergeDrops(pendingDrops, resolved.drops ?? {});
      message = resolved.message;
      lastCombat = resolved.summary;
    } else if (tile === "elite") {
      const resolved =
        combat ??
        fallbackGridDungeonCombat("정예 수문장", 3, 0, run.hp);
      hp = Math.max(0, hp - resolved.hpLost);
      pendingGold += resolved.rewardGold;
      pendingDrops = mergeDrops(pendingDrops, resolved.drops ?? {});
      message = resolved.message;
      lastCombat = resolved.summary;
    } else if (tile === "treasure") {
      pendingDrops = mergeDrops(pendingDrops, eventDrops);
      message = "오래된 보물상자에서 재료를 발견했습니다.";
    } else if (tile === "fountain") {
      hp = Math.min(GRID_DUNGEON_MAX_HP, hp + 4);
      message = "맑은 샘물을 마셔 체력을 회복했습니다.";
    } else if (tile === "boss") {
      const resolved =
        combat ??
        fallbackGridDungeonCombat("유적의 파수꾼", 4, 0, run.hp);
      hp = Math.max(0, hp - resolved.hpLost);
      pendingGold += resolved.rewardGold;
      pendingDrops = mergeDrops(pendingDrops, resolved.drops ?? {});
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
    pendingDrops = {};
    message = "탐험 중 쓰러졌습니다. 이번 탐험 보상은 잃었습니다.";
  }

  const nextRun: GridDungeonRun = {
    ...run,
    layout,
    status,
    pos: next,
    hp,
    pendingGold,
    ...(hasGridDungeonDrops(pendingDrops) ? { pendingDrops } : {}),
    bossDefeated,
    visited: [...visited].sort(),
    revealed: revealAround(next.x, next.y, run.revealed, layout),
    clearedEvents: [...clearedEvents].sort(),
    lastMessage: message,
    updatedAt: now,
  };
  if (lastCombat) nextRun.lastCombat = lastCombat;
  else delete nextRun.lastCombat;
  if (!hasGridDungeonDrops(nextRun.pendingDrops)) delete nextRun.pendingDrops;

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
        : `${enemyName}을(를) 쓰러뜨렸습니다.`,
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
