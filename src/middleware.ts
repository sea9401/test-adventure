import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

// 게이트가 닫혀 있을 때도 통과시킬 경로. /api/health 만 허용해 systemd/nginx
// health check 가 살아 있게 함. 정적 자원은 matcher 에서 이미 제외.
const STAGING_ALLOW = new Set<string>(["/api/health"]);

// 닫힌 상태에서 직접 반환할 HTML.
// rewrite 패턴이 next-auth wrapper 안에서 host 를 AUTH_URL 로 잡아 외부 proxy
// 시도(DNS 실패) → 500 이 떴기 때문에, HTML 을 인라인으로 직접 보낸다.
const CLOSED_HTML = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex,nofollow" />
<title>테스트 서버 운영중이지 않습니다</title>
<style>
  html,body{margin:0;padding:0;height:100%;background:#0a0a0a;color:#e5e5e5;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
  main{min-height:100%;display:flex;align-items:center;justify-content:center;padding:1.5rem}
  .box{max-width:28rem;text-align:center}
  h1{font-size:1.5rem;font-weight:700;margin:0 0 0.75rem}
  p{font-size:0.875rem;color:#a3a3a3;line-height:1.6;margin:0}
</style>
</head>
<body>
<main>
  <div class="box">
    <h1>테스트 서버 운영중이지 않습니다</h1>
    <p>현재 점검 또는 작업 중이라 잠시 접근을 막아두었어요.<br />다음 테스트가 열리면 다시 방문해 주세요.</p>
  </div>
</main>
</body>
</html>`;

export default auth((req) => {
  // IS_STAGING=true 인 환경에서만 게이트 작동. STAGING_OPEN=true 면 통과.
  // prod 에선 IS_STAGING 미설정이라 항상 우회.
  if (
    process.env.IS_STAGING === "true" &&
    process.env.STAGING_OPEN !== "true"
  ) {
    if (!STAGING_ALLOW.has(req.nextUrl.pathname)) {
      return new NextResponse(CLOSED_HTML, {
        status: 503,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
          "retry-after": "3600",
        },
      });
    }
  }
  // V2_AS_ROOT — 스테이징에서 루트(/)를 v2 게임(/dev/v2-game)으로 서빙. 운영 컷오버 리허설용.
  // 플래그 켤 때만 + **staging 한정**(prod 오작동 방지 — 운영의 진짜 이전은 별건). URL 은 / 유지
  // (rewrite). /dev/v2-game page 의 IS_STAGING 가드는 통과하므로 404 안 남. 플래그 끄면 즉시 원복.
  if (
    process.env.IS_STAGING === "true" &&
    process.env.V2_AS_ROOT === "true" &&
    req.nextUrl.pathname === "/"
  ) {
    return NextResponse.rewrite(new URL("/dev/v2-game", req.url));
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
