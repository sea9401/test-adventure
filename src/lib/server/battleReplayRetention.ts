import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { battleReplays } from "@/db/schema";

export const BATTLE_REPLAY_CLEANUP_BATCH_SIZE = 1_000;
const BATTLE_REPLAY_CLEANUP_LOCK_KEY =
  "adventure-rpg:battle-replay-retention:v1";

type CleanupExecutor = {
  execute(query: SQL): Promise<unknown>;
};

type CleanupCountRow = {
  acquired?: boolean;
  deleted: string | number;
};

function rowsOf(result: unknown): CleanupCountRow[] {
  return (result as { rows?: CleanupCountRow[] }).rows ?? [];
}

const defaultExecutor: CleanupExecutor = {
  execute: (query) => db.execute(query),
};

export async function deleteExpiredBattleReplayBatch(
  executor: CleanupExecutor = defaultExecutor,
  now = new Date(),
) {
  const result = await executor.execute(sql`
    WITH cleanup_lock AS MATERIALIZED (
      SELECT pg_try_advisory_xact_lock(
        hashtext(${BATTLE_REPLAY_CLEANUP_LOCK_KEY})
      ) AS acquired
    ), due AS MATERIALIZED (
      SELECT battle_replays.ctid
      FROM ${battleReplays}
      CROSS JOIN cleanup_lock
      WHERE cleanup_lock.acquired
        AND ${battleReplays.expiresAt} < ${now}
      ORDER BY ${battleReplays.expiresAt}
      LIMIT ${BATTLE_REPLAY_CLEANUP_BATCH_SIZE}
    ), removed AS (
      DELETE FROM ${battleReplays} AS replay
      USING due
      WHERE replay.ctid = due.ctid
      RETURNING 1 AS removed
    )
    SELECT cleanup_lock.acquired,
      count(removed.removed)::int AS deleted
    FROM cleanup_lock
    LEFT JOIN removed ON true
    GROUP BY cleanup_lock.acquired
  `);
  const row = rowsOf(result)[0];
  const deleted = Number(row?.deleted ?? 0);
  return {
    deleted,
    more: deleted >= BATTLE_REPLAY_CLEANUP_BATCH_SIZE,
    batchSize: BATTLE_REPLAY_CLEANUP_BATCH_SIZE,
    skipped: row?.acquired === false,
  };
}
