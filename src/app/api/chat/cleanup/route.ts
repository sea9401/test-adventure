import { lt } from "drizzle-orm";
import { db } from "@/db";
import { messages } from "@/db/schema";
import { CHAT_RETENTION_DAYS } from "@/lib/chat-config";
import { requireCronAuth } from "@/lib/server/cronAuth";

// Vercel Cron 으로 매일 호출. CHAT_RETENTION_DAYS 일 이상 지난 메시지 삭제.
// CRON_SECRET 으로 외부 호출 차단.

export async function GET(req: Request) {
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;

  const cutoff = new Date(
    Date.now() - CHAT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );
  const deleted = await db
    .delete(messages)
    .where(lt(messages.createdAt, cutoff))
    .returning({ id: messages.id });

  return Response.json({ ok: true, deleted: deleted.length, cutoff });
}
