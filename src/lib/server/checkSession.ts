import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import {
  DEVICE_SESSION_COOKIE,
  isValidDeviceSessionId,
} from "@/lib/deviceSessionConfig";
import { getActiveAdminImpersonation } from "@/lib/server/adminImpersonation";

// 단일 세션 enforce — 새 디바이스가 /api/session/claim 으로 새 토큰을 박으면
// 기존 디바이스의 다음 요청은 HttpOnly 기기 쿠키가 일치하지 않아 410 으로 거절된다.
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
  const incoming = deviceSessionIdFromRequest(req);
  if (!incoming) {
    // 쿠키 미발급 — claim 전 부트스트랩 호환 경로만 허용. 보호가 필수인 라우트는
    // requireActiveDeviceSession 을 호출해 쿠키를 강제한다.
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

function deviceSessionIdFromRequest(req: Request): string | null {
  const rawCookies = req.headers.get("cookie") ?? "";
  for (const part of rawCookies.split(";")) {
    const [name, ...valueParts] = part.trim().split("=");
    if (name !== DEVICE_SESSION_COOKIE) continue;
    const value = valueParts.join("=");
    return isValidDeviceSessionId(value) ? value : null;
  }
  // 구 클라이언트와 라우트 테스트의 점진적 호환. 새 클라이언트는 HttpOnly 쿠키가 권위다.
  const legacyHeader = req.headers.get("x-session-id");
  return isValidDeviceSessionId(legacyHeader) ? legacyHeader : null;
}

// 단일 세션 보호가 필수인 라우트용. HttpOnly 기기 쿠키(구 클라는 X-Session-Id)가
// 비면 401 거절한다. 쿠키를 지워 세션 검사를 우회하는 것도 차단한다.
export async function requireActiveDeviceSession(
  userId: string,
  req: Request,
): Promise<Response | null> {
  const incoming = deviceSessionIdFromRequest(req);
  if (!incoming) {
    return new Response(
      JSON.stringify({ error: "missing_device_session" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }
  return checkSession(userId, req);
}
