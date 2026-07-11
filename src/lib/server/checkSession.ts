import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getActiveAdminImpersonation } from "@/lib/server/adminImpersonation";

// 단일 세션 enforce — 새 디바이스가 /api/session/claim 으로 새 토큰을 박으면
// 기존 디바이스의 다음 요청은 X-Session-Id 가 일치하지 않아 410 으로 거절된다.
//
// activeSessionId 가 NULL 인 경우 (legacy / 첫 진입 직전) 는 통과 — 클라이언트가
// 곧 claim 호출로 채울 거고, claim 전 한 번의 GET 정도는 허용해야 SaveProvider 의
// 부트스트랩이 가능.
//
// 반환: 일치하면 null, 불일치면 410 Response.
export async function checkSession(
  userId: string,
  req: Request,
): Promise<Response | null> {
  const impersonation = await getActiveAdminImpersonation();
  if (impersonation?.targetUserId === userId) return null;
  const incoming = req.headers.get("x-session-id");
  if (!incoming) {
    // 헤더 미동봉 — claim 전 부트스트랩 GET 등에 허용. 정상 클라이언트는 claim 후
    // 모든 호출에 헤더 붙임. 단일 세션 보호가 필요한 mutation 라우트는 아래
    // requireSessionHeader 를 별도로 호출해 헤더를 강제할 것.
    return null;
  }
  const rows = await db
    .select({ activeSessionId: users.activeSessionId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const stored = rows[0]?.activeSessionId ?? null;
  if (stored === null) return null; // 아직 claim 한 디바이스 없음 — 통과
  if (stored === incoming) return null; // 정상
  // 다른 디바이스가 claim 함 → 이 요청은 무효.
  return new Response(
    JSON.stringify({ error: "session_invalidated" }),
    { status: 410, headers: { "Content-Type": "application/json" } },
  );
}

// 단일 세션 보호가 필수인 mutation 라우트용. checkSession 보다 엄격 — X-Session-Id
// 헤더가 비면 401 거절한다 (헤더를 빼서 세션 enforce 를 우회하는 공격 차단).
// 그 외 동작은 checkSession 과 동일.
export async function requireSessionHeader(
  userId: string,
  req: Request,
): Promise<Response | null> {
  const incoming = req.headers.get("x-session-id");
  if (!incoming) {
    return new Response(
      JSON.stringify({ error: "missing_session_header" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }
  return checkSession(userId, req);
}
