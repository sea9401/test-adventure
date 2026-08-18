import { randomUUID } from "node:crypto";
import { battleReplays } from "@/db/schema";
import type { db } from "@/db";
import {
  toDeferredReplayPayload,
  type ReplayPayload,
} from "@/adventure/data/v2/replayPayload";

type DbExecutor =
  | typeof db
  | Parameters<Parameters<typeof db.transaction>[0]>[0];

const HOUR_MS = 60 * 60 * 1_000;
const DAY_MS = 24 * HOUR_MS;

export const BATTLE_REPLAY_RETENTION_MS = {
  batchHunt: 2 * HOUR_MS,
  arena: 14 * DAY_MS,
} as const;

type DeferredReplayOptions = {
  inlineLogLimit?: number;
  retentionMs?: number;
};

export async function storeBattleReplays(
  executor: DbExecutor,
  userId: string,
  payloads: ReplayPayload[],
  retentionMs: number,
  now = new Date(),
): Promise<ReplayPayload[]> {
  if (payloads.length === 0) return [];
  const expiresAt = new Date(now.getTime() + retentionMs);
  const rows = payloads.map((payload) => ({
    id: randomUUID(),
    userId,
    payload,
    expiresAt,
    createdAt: now,
  }));
  await executor.insert(battleReplays).values(rows);
  return rows.map((row) => toDeferredReplayPayload(row.payload, row.id));
}

export async function storeBattleReplay(
  executor: DbExecutor,
  userId: string,
  payload: ReplayPayload,
  retentionMs: number,
  now = new Date(),
): Promise<ReplayPayload> {
  const [stored] = await storeBattleReplays(
    executor,
    userId,
    [payload],
    retentionMs,
    now,
  );
  return stored;
}

export async function deferLongBattleReplays(
  executor: DbExecutor,
  userId: string,
  payloads: ReplayPayload[],
  options: DeferredReplayOptions = {},
  now = new Date(),
): Promise<ReplayPayload[]> {
  const inlineLogLimit = options.inlineLogLimit ?? 80;
  const longPayloads = payloads.filter(
    (payload) => payload.log.length > inlineLogLimit,
  );
  if (longPayloads.length === 0) return payloads;

  let deferred: ReplayPayload[];
  try {
    deferred = await storeBattleReplays(
      executor,
      userId,
      longPayloads,
      options.retentionMs ?? BATTLE_REPLAY_RETENTION_MS.batchHunt,
      now,
    );
  } catch (error) {
    console.warn(
      "[battleReplayStore] batch replay persistence failed",
      error,
    );
    return payloads;
  }

  let deferredIndex = 0;
  return payloads.map((payload) =>
    payload.log.length > inlineLogLimit
      ? (deferred[deferredIndex++] ?? payload)
      : payload,
  );
}
