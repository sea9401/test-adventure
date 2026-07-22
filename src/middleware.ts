import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

// 게이트가 닫혀 있을 때도 통과시킬 경로. /api/health 만 허용해 systemd/nginx
// health check 가 살아 있게 함. 정적 자원은 matcher 에서 이미 제외.
const STAGING_ALLOW = new Set<string>(["/api/health"]);

// 예전 앱-레벨 점검 모드와의 호환용 fallback. 현재 운영 토글은 앱이 완전히 내려가도
// 화면을 유지하도록 nginx 플래그(/etc/nginx/msmsge-maintenance.on)를 사용한다.
//   MAINTENANCE_MODE=true 가 예전 .env.production.local 에 남은 경우에만 여기서 동작.
//   /api/health 는 통과 → 모니터/헬스가 점검 중에도 살아있어 업타임 알림 오발 방지.
//   deploy/maintenance.sh off 가 legacy 값을 false 로 정리한 뒤 nginx 플래그를 해제한다.
const MAINTENANCE_ALLOW = new Set<string>(["/api/health"]);

// 점검 중 보일 HTML. CLOSED_HTML 과 동일 톤(니어블랙·미니멀·이모지 없음). 앱 의존 없이 인라인.
const MAINTENANCE_HTML = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex,nofollow" />
<title>점검 중입니다</title>
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
    <h1>잠시 점검 중입니다</h1>
    <p>더 나은 모습으로 준비하고 있어요.<br />잠시 후 다시 찾아주세요 — 곧 돌아오겠습니다.</p>
  </div>
</main>
</body>
</html>`;

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
  // 점검 모드 — staging 무관하게 prod 에서도 작동. allow-list(헬스) 외 전부 점검 페이지(503).
  if (process.env.MAINTENANCE_MODE === "true") {
    if (!MAINTENANCE_ALLOW.has(req.nextUrl.pathname)) {
      return new NextResponse(MAINTENANCE_HTML, {
        status: 503,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
          "retry-after": "600",
        },
      });
    }
    return; // 점검 중 allow-list 통과분은 인증 게이트 건너뜀(헬스 등 공개).
  }
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

  // 비로그인 루트 요청은 라우트가 렌더링되기 전에 공개 대문으로 이동시킨다.
  // page 의 redirect() 는 스트리밍이 먼저 시작되면 200 + 클라이언트 이동이 될 수 있어,
  // 검색 로봇에도 명확한 HTTP 307 응답을 주려면 이 단계에서 처리해야 한다.
  if (req.nextUrl.pathname === "/" && !req.auth?.user) {
    return NextResponse.redirect(new URL("/sign-in", req.url));
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
