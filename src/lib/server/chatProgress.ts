import { savesKv } from "@/db/schema";
import { grantTitleIfMissingInTx } from "@/lib/server/grantTitle";
import {
  lockSaveForUpdate,
  upsertSave,
  type DbExecutor,
} from "@/lib/server/savesKv";

const CHATTERBOX_TITLE_ID = "chatterbox";
const CHATTERBOX_CHAT_TARGET = 100;

type ChatProgressLog = {
  chatCount?: number;
  titles?: Record<string, { obtainedAt: number }>;
  [k: string]: unknown;
};

function safeCount(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

export async function recordUserChatMessageInTx(
  tx: DbExecutor,
  userId: string,
  obtainedAt: number,
): Promise<number> {
  await tx
    .insert(savesKv)
    .values({ userId, key: "adventure-log.v2", value: {} })
    .onConflictDoNothing();

  const logSave = await lockSaveForUpdate<ChatProgressLog>(
    tx,
    userId,
    "adventure-log.v2",
    {},
  );
  const nextChatCount = safeCount(logSave.chatCount) + 1;

  await upsertSave(tx, userId, "adventure-log.v2", {
    ...logSave,
    chatCount: nextChatCount,
  });

  if (
    nextChatCount >= CHATTERBOX_CHAT_TARGET &&
    !logSave.titles?.[CHATTERBOX_TITLE_ID]
  ) {
    await grantTitleIfMissingInTx(tx, userId, CHATTERBOX_TITLE_ID, obtainedAt);
  }

  return nextChatCount;
}
