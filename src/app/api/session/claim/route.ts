import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { users } from "@/db/schema";
import {
  DEVICE_SESSION_COOKIE,
  DEVICE_SESSION_COOKIE_MAX_AGE,
  DEVICE_SESSION_TAKEOVER_COOKIE,
  isValidDeviceSessionId,
} from "@/lib/deviceSessionConfig";
import { ensureOriginalUser } from "@/lib/server/ensureUser";

// POST /api/session/claim — 이 브라우저를 계정의 유일한 활성 기기로 등록한다.
// 실제 OAuth 로그인 직후에만 takeover 쿠키가 있어 다른 기기를 교체할 수 있다.
// 같은 기기의 새로고침은 기존 sessionId 일치로 통과하지만, 무효화된 기기의 새로고침은 409.
export async function POST(req: Request) {
  const userId = await ensureOriginalUser();
  if (!userId) return new Response("unauthorized", { status: 401 });

  let body: { sessionId?: unknown };
  try {
    body = (await req.json()) as { sessionId?: unknown };
  } catch {
    return new Response("invalid json", { status: 400 });
  }
  if (!isValidDeviceSessionId(body.sessionId)) {
    return new Response("invalid sessionId", { status: 400 });
  }
  const sessionId = body.sessionId;
  const cookieStore = await cookies();
  const takeover = cookieStore.get(DEVICE_SESSION_TAKEOVER_COOKIE)?.value === "1";

  const result = await db.transaction(async (tx) => {
    const [user] = await tx
      .select({ activeSessionId: users.activeSessionId })
      .from(users)
      .where(eq(users.id, userId))
      .for("update")
      .limit(1);
    if (!user) return { status: 401 as const, error: "unauthorized" as const };

    const activeSessionId = user.activeSessionId;
    const sameDevice = activeSessionId === sessionId;
    if (activeSessionId !== null && !sameDevice && !takeover) {
      return { status: 409 as const, error: "session_in_use" as const };
    }

    if (!sameDevice) {
      await tx
        .update(users)
        .set({ activeSessionId: sessionId, updatedAt: new Date() })
        .where(eq(users.id, userId));
    }
    return { status: 200 as const, replaced: activeSessionId !== null && !sameDevice };
  });

  if (result.status !== 200) {
    return Response.json({ ok: false, error: result.error }, { status: result.status });
  }

  cookieStore.set(DEVICE_SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DEVICE_SESSION_COOKIE_MAX_AGE,
    priority: "high",
  });
  // 로그인 우선권은 한 번만 사용한다. 이후 새로고침은 sessionId 일치로만 통과한다.
  cookieStore.set(DEVICE_SESSION_TAKEOVER_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  return Response.json({ ok: true, replaced: result.replaced });
}
