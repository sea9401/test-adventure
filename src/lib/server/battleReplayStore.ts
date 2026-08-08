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

const DAY_MS = 24 * 60 * 60 * 1_000;

export const BATTLE_REPLAY_RETENTION_DAYS = {
  batchHunt: 1,
  arena: 14,
} as const;

export async function storeBattleReplays(
  executor: DbExecutor,
  userId: string,
  payloads: ReplayPayload[],
  retentionDays: number,
  now = new Date(),
): Promise<ReplayPayload[]> {
  if (payloads.length === 0) return [];
  const expiresAt = new Date(now.getTime() + retentionDays * DAY_MS);
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
  retentionDays: number,
  now = new Date(),
): Promise<ReplayPayload> {
  const [stored] = await storeBattleReplays(
    executor,
    userId,
    [payload],
    retentionDays,
    now,
  );
  return stored;
}
