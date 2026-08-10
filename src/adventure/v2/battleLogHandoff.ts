import type { BattleStats } from "@/adventure/battle/BattleScene";
import type { ReplayPayload } from "@/adventure/data/v2/replayPayload";
import type { ProfileBorderId } from "@/adventure/data/v2/museunCosmetics";
import type { Gender } from "@/adventure/profile/avatars";

const HANDOFF_KEY_PREFIX = "battle-log-handoff.v1:";
const DEFAULT_HANDOFF_TTL_MS = 2 * 60 * 60 * 1_000;
const memoryHandoffs = new Map<string, StoredBattleLogHandoff>();

export type BattleLogStorage = Pick<
  Storage,
  "getItem" | "removeItem" | "setItem"
>;

export type BattleLogReplayProps = {
  payload: ReplayPayload;
  startPlayerHp?: number;
  playerName: string;
  gender: Gender;
  exp: number;
  maxExp: number;
  hpCharges?: number;
  mpCharges?: number;
  playerSubtitle?: string;
  playerCombat?: BattleStats;
  outcome?: "win" | "lose";
  profileBorder?: ProfileBorderId | null;
};

export type BattleLogHandoff =
  | {
      kind: "replay";
      title: string;
      replay: BattleLogReplayProps;
    }
  | {
      kind: "text";
      title: string;
      playerName: string;
      enemyName: string;
      lines: string[];
    };

type StoredBattleLogHandoff = {
  version: 1;
  expiresAt: number;
  data: BattleLogHandoff;
};

type HandoffOptions = {
  storage?: BattleLogStorage | null;
  now?: number;
};

type WriteHandoffOptions = HandoffOptions & {
  id?: string;
  ttlMs?: number;
};

function browserStorage(): BattleLogStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function handoffKey(id: string): string {
  return `${HANDOFF_KEY_PREFIX}${id}`;
}

function newHandoffId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isBattleLogHandoff(value: unknown): value is BattleLogHandoff {
  if (!isRecord(value) || typeof value.title !== "string") return false;
  if (value.kind === "text") {
    return (
      typeof value.playerName === "string" &&
      typeof value.enemyName === "string" &&
      Array.isArray(value.lines) &&
      value.lines.every((line) => typeof line === "string")
    );
  }
  if (value.kind !== "replay" || !isRecord(value.replay)) return false;
  return (
    typeof value.replay.playerName === "string" &&
    typeof value.replay.gender === "string" &&
    typeof value.replay.exp === "number" &&
    typeof value.replay.maxExp === "number" &&
    isRecord(value.replay.payload) &&
    isRecord(value.replay.payload.enemy) &&
    typeof value.replay.payload.enemy.name === "string" &&
    Array.isArray(value.replay.payload.log)
  );
}

function parseStoredHandoff(value: string): StoredBattleLogHandoff | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      !isRecord(parsed) ||
      parsed.version !== 1 ||
      typeof parsed.expiresAt !== "number" ||
      !Number.isFinite(parsed.expiresAt) ||
      !isBattleLogHandoff(parsed.data)
    ) {
      return null;
    }
    return parsed as StoredBattleLogHandoff;
  } catch {
    return null;
  }
}

export function battleLogHandoffHref(id: string): string {
  return `/battle/log/${encodeURIComponent(id)}`;
}

export function writeBattleLogHandoff(
  data: BattleLogHandoff,
  options: WriteHandoffOptions = {},
): string {
  const now = options.now ?? Date.now();
  for (const [storedId, stored] of memoryHandoffs) {
    if (stored.expiresAt <= now) memoryHandoffs.delete(storedId);
  }
  const id = options.id ?? newHandoffId();
  const stored: StoredBattleLogHandoff = {
    version: 1,
    expiresAt: now + (options.ttlMs ?? DEFAULT_HANDOFF_TTL_MS),
    data,
  };
  memoryHandoffs.set(id, stored);

  const storage =
    options.storage === undefined ? browserStorage() : options.storage;
  try {
    storage?.setItem(handoffKey(id), JSON.stringify(stored));
  } catch {
    // 같은 SPA 이동에서는 메모리 백업으로 계속 열 수 있다.
  }
  return id;
}

export function readBattleLogHandoff(
  id: string,
  options: HandoffOptions = {},
): BattleLogHandoff | null {
  const storage =
    options.storage === undefined ? browserStorage() : options.storage;
  const now = options.now ?? Date.now();
  let stored = memoryHandoffs.get(id) ?? null;

  if (!stored) {
    let raw: string | null = null;
    try {
      raw = storage?.getItem(handoffKey(id)) ?? null;
    } catch {
      raw = null;
    }
    if (raw) stored = parseStoredHandoff(raw);
    if (raw && !stored) {
      try {
        storage?.removeItem(handoffKey(id));
      } catch {
        // 손상 레코드 제거 실패는 조회 결과에 영향을 주지 않는다.
      }
    }
  }

  if (!stored || stored.expiresAt <= now || !isBattleLogHandoff(stored.data)) {
    memoryHandoffs.delete(id);
    try {
      storage?.removeItem(handoffKey(id));
    } catch {
      // 만료 레코드 제거 실패는 조회 결과에 영향을 주지 않는다.
    }
    return null;
  }

  memoryHandoffs.set(id, stored);
  return stored.data;
}
