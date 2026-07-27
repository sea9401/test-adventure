import "server-only";

import { and, asc, eq, inArray, lte } from "drizzle-orm";
import { db } from "@/db";
import { storageDeletionQueue } from "@/db/schema";
import { deleteFeedbackImage } from "@/lib/server/feedbackImageStorage";
import { deleteGuildEmblemImagesForGuild } from "@/lib/server/guildEmblemStorage";
import { deleteProfileImagesForUser } from "@/lib/server/profileImageStorage";

export type StorageDeletionKind =
  | "profile_user"
  | "feedback_image"
  | "guild";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const RETRY_BASE_MS = 5 * 60 * 1_000;
const RETRY_MAX_MS = 24 * 60 * 60 * 1_000;

type QueueOptions = {
  ids?: number[];
  limit?: number;
};

export type StorageDeletionResult = {
  attempted: number;
  completed: number;
  failed: number;
  objectsDeleted: number;
};

function errorMessage(error: unknown) {
  return (error instanceof Error ? error.message : "unknown_error").slice(0, 500);
}

function retryDelay(attempts: number) {
  return Math.min(RETRY_BASE_MS * 2 ** Math.min(attempts, 8), RETRY_MAX_MS);
}

async function deleteTarget(kind: string, target: string): Promise<number> {
  if (kind === "profile_user") {
    return deleteProfileImagesForUser(target);
  }
  if (kind === "feedback_image") {
    await deleteFeedbackImage(target);
    return 1;
  }
  if (kind === "guild") {
    return deleteGuildEmblemImagesForGuild(Number(target));
  }
  throw new Error("unsupported_storage_deletion_kind");
}

// 계정 삭제 직후에는 방금 생성한 ids 만, 일일 크론에서는 기한이 된 전체 큐를 처리한다.
// R2 DELETE 는 멱등이므로 동시 실행되어도 안전하며, 성공한 행만 큐에서 제거한다.
export async function processStorageDeletionQueue(
  options: QueueOptions = {},
): Promise<StorageDeletionResult> {
  const ids = options.ids?.filter((id) => Number.isSafeInteger(id) && id > 0);
  if (options.ids && (!ids || ids.length === 0)) {
    return { attempted: 0, completed: 0, failed: 0, objectsDeleted: 0 };
  }
  const limit = Math.min(
    Math.max(Math.floor(options.limit ?? DEFAULT_LIMIT), 1),
    MAX_LIMIT,
  );
  const now = new Date();
  const due = await db
    .select({
      id: storageDeletionQueue.id,
      kind: storageDeletionQueue.kind,
      target: storageDeletionQueue.target,
      attempts: storageDeletionQueue.attempts,
    })
    .from(storageDeletionQueue)
    .where(
      ids
        ? and(
            lte(storageDeletionQueue.nextAttemptAt, now),
            inArray(storageDeletionQueue.id, ids),
          )
        : lte(storageDeletionQueue.nextAttemptAt, now),
    )
    .orderBy(asc(storageDeletionQueue.createdAt))
    .limit(limit);

  let completed = 0;
  let failed = 0;
  let objectsDeleted = 0;
  for (const row of due) {
    try {
      objectsDeleted += await deleteTarget(row.kind, row.target);
      await db.delete(storageDeletionQueue).where(eq(storageDeletionQueue.id, row.id));
      completed += 1;
    } catch (error) {
      const attempts = row.attempts + 1;
      const attemptedAt = new Date();
      await db
        .update(storageDeletionQueue)
        .set({
          attempts,
          lastError: errorMessage(error),
          lastAttemptAt: attemptedAt,
          nextAttemptAt: new Date(attemptedAt.getTime() + retryDelay(attempts)),
          updatedAt: attemptedAt,
        })
        .where(eq(storageDeletionQueue.id, row.id));
      failed += 1;
    }
  }

  return { attempted: due.length, completed, failed, objectsDeleted };
}
