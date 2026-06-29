import { auth } from "@/auth";
import { cookies } from "next/headers";

// 계정 연동 시작: 쿠키에 현재 유저 ID를 저장하고 204 반환.
// 클라이언트는 이후 signIn(provider) 를 호출해 OAuth 를 시작한다.
// signIn 콜백이 쿠키를 감지해 신규 계정 생성 대신 기존 유저에 계정 행만 추가한다.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("unauthorized", { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as { provider?: string };
  if (!body.provider || !["google", "kakao"].includes(body.provider)) {
    return new Response("invalid provider", { status: 400 });
  }

  const cookieStore = await cookies();
  cookieStore.set("link_user_id", session.user.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 300,
    sameSite: "lax",
    path: "/",
  });

  return new Response(null, { status: 204 });
}
