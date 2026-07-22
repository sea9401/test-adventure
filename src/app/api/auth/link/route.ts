import { auth } from "@/auth";
import { cookies } from "next/headers";
import {
  ACCOUNT_LINK_INTENT_COOKIE,
  ACCOUNT_LINK_INTENT_TTL_SECONDS,
  createAccountLinkIntent,
  isAccountLinkProvider,
} from "@/lib/server/accountLinkIntent";

// 계정 연동 시작: 서버에는 hash와 현재 user/provider를, 브라우저에는 무작위 원문
// token만 5분간 저장한다. OAuth callback은 token을 원자적으로 소비하고 현재 JWT
// 사용자까지 다시 대조한다. 사용자 ID를 쿠키에 직접 넣지 않는다.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("unauthorized", { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as { provider?: unknown };
  if (!isAccountLinkProvider(body.provider)) {
    return new Response("invalid provider", { status: 400 });
  }

  const token = await createAccountLinkIntent(session.user.id, body.provider);
  const cookieStore = await cookies();
  // 취약한 옛 쿠키가 남아 있어도 callback이 읽지 않도록 즉시 만료한다.
  cookieStore.set("link_user_id", "", { maxAge: 0, path: "/" });
  cookieStore.set(ACCOUNT_LINK_INTENT_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: ACCOUNT_LINK_INTENT_TTL_SECONDS,
    sameSite: "lax",
    path: "/api/auth",
    priority: "high",
  });

  return new Response(null, { status: 204 });
}
