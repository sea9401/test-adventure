import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { ensureOriginalUser } from "@/lib/server/ensureUser";

// POST /api/session/claim — body { sessionId: string }
// 새로 진입한 디바이스가 호출. 그 사용자의 active_session_id 를 새 토큰으로 덮어씀.
// 다른 디바이스의 다음 PATCH/GET 요청은 X-Session-Id 헤더가 일치하지 않아 410 으로
// 거절돼 자동 로그아웃 처리된다.
export async function POST(req: Request) {
  const userId = await ensureOriginalUser();
  if (!userId) return new Response("unauthorized", { status: 401 });

  let body: { sessionId?: unknown };
  try {
    body = (await req.json()) as { sessionId?: unknown };
  } catch {
    return new Response("invalid json", { status: 400 });
  }
  const sessionId = body.sessionId;
  if (typeof sessionId !== "string" || sessionId.length === 0 || sessionId.length > 100) {
    return new Response("invalid sessionId", { status: 400 });
  }

  await db
    .update(users)
    .set({ activeSessionId: sessionId, updatedAt: new Date() })
    .where(eq(users.id, userId));

  return Response.json({ ok: true });
}
