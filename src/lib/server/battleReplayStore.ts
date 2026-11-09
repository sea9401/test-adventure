import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
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

// 묶음 결과 카드는 가장 최근 묶음의 회차 버튼만 보여 준다. 운영 기록(2026-11-09)상 열람은
// 묶음 직후 2~17초 안에만 있었으므로, 직전 묶음까지 두 묶음만 남기고 나머지는 바로 지운다.
// 2시간 보관을 그대로 두면 연속 사냥 계정 하나가 2시간에 6만 행·0.9GB를 쌓았다.
export const BATCH_HUNT_REPLAY_KEEP_BATCHES = 2;
// 배포 직후 남아 있던 기록(최대 2시간치)을 한 요청에서 몰아 지우지 않도록 한 번에 지우는
// 행 수를 묶는다. 연속 사냥 중이면 매 묶음마다 10묶음씩 줄어 몇 분 안에 정리된다.
export const BATCH_HUNT_REPLAY_PRUNE_LIMIT = 500;

type DeferredReplayOptions = {
  inlineLogLimit?: number;
  retentionMs?: number;
  /** 지정하면 저장 뒤 같은 유저의 묶음 기록을 최근 N개 묶음만 남긴다. */
  keepLatestBatches?: number;
};

function safeReplayErrorMetadata(error: unknown): {
  name: string;
  code?: string;
} {
  if (!(error instanceof Error)) return { name: "UnknownError" };
  const name = /^[A-Za-z0-9_]{1,64}$/.test(error.name)
    ? error.name
    : "Error";
  const rawCode = (error as Error & { code?: unknown }).code;
  const code =
    typeof rawCode === "string" && /^[A-Za-z0-9_]{1,64}$/.test(rawCode)
      ? rawCode
      : null;
  return { name, ...(code ? { code } : {}) };
}

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

// 한 묶음의 기록은 같은 createdAt으로 저장되므로 createdAt 값 하나가 묶음 하나다.
// 아레나 기록(14일 보관)은 보관 기간이 하루 미만인 행만 고르는 조건으로 제외한다.
export async function pruneOlderBatchHuntReplays(
  executor: DbExecutor,
  userId: string,
  keepBatches: number,
): Promise<void> {
  const keep = Math.max(1, Math.floor(keepBatches));
  await executor.execute(sql`
    DELETE FROM ${battleReplays}
    WHERE ctid IN (
      SELECT ctid
      FROM ${battleReplays}
      WHERE ${battleReplays.userId} = ${userId}
        AND ${battleReplays.expiresAt} - ${battleReplays.createdAt} < interval '1 day'
        AND ${battleReplays.createdAt} < (
          SELECT ${battleReplays.createdAt}
          FROM ${battleReplays}
          WHERE ${battleReplays.userId} = ${userId}
            AND ${battleReplays.expiresAt} - ${battleReplays.createdAt} < interval '1 day'
          GROUP BY ${battleReplays.createdAt}
          ORDER BY ${battleReplays.createdAt} DESC
          OFFSET ${keep - 1}
          LIMIT 1
        )
      LIMIT ${BATCH_HUNT_REPLAY_PRUNE_LIMIT}
    )
  `);
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
      safeReplayErrorMetadata(error),
    );
    return payloads;
  }

  if (options.keepLatestBatches) {
    try {
      await pruneOlderBatchHuntReplays(executor, userId, options.keepLatestBatches);
    } catch (error) {
      // 정리는 다음 묶음이나 만료 크론이 다시 하므로 사냥 응답은 막지 않는다.
      console.warn(
        "[battleReplayStore] batch replay prune failed",
        safeReplayErrorMetadata(error),
      );
    }
  }

  let deferredIndex = 0;
  return payloads.map((payload) =>
    payload.log.length > inlineLogLimit
      ? (deferred[deferredIndex++] ?? payload)
      : payload,
  );
}
