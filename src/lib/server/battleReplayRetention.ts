import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { battleReplays } from "@/db/schema";

export const BATTLE_REPLAY_CLEANUP_BATCH_SIZE = 1_000;

type CleanupExecutor = {
  execute(query: SQL): Promise<unknown>;
};

type CleanupCountRow = {
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
    WITH due AS MATERIALIZED (
      SELECT ctid
      FROM ${battleReplays}
      WHERE ${battleReplays.expiresAt} < ${now}
      ORDER BY ${battleReplays.expiresAt}
      LIMIT ${BATTLE_REPLAY_CLEANUP_BATCH_SIZE}
    ), removed AS (
      DELETE FROM ${battleReplays} AS replay
      USING due
      WHERE replay.ctid = due.ctid
      RETURNING replay.ctid
    )
    SELECT count(*)::int AS deleted
    FROM removed
  `);
  const deleted = Number(rowsOf(result)[0]?.deleted ?? 0);
  return {
    deleted,
    more: deleted >= BATTLE_REPLAY_CLEANUP_BATCH_SIZE,
    batchSize: BATTLE_REPLAY_CLEANUP_BATCH_SIZE,
  };
}
