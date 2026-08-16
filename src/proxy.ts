import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";
import { isApiRequestBodyTooLarge } from "@/lib/apiRequestBodyLimit";
import { canPassMuseunCoinShopProxy } from "@/lib/museunCoinShopGate";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

// 게이트가 닫혀 있을 때도 통과시킬 경로. /api/health 만 허용해 systemd/nginx
// health check 가 살아 있게 함. 정적 자원은 matcher 에서 이미 제외.
const STAGING_ALLOW = new Set<string>(["/api/health"]);

// 예전 앱-레벨 점검 모드와의 호환용 fallback. Proxy는 편의 게이트일 뿐 보안 인가의
// 진실 출처가 아니며, 각 Route Handler가 세션·역할을 다시 검증한다. 현재 운영 토글은 앱이 완전히 내려가도
// 화면을 유지하도록 nginx 플래그(/etc/nginx/msmsge-maintenance.on)를 사용한다.
//   MAINTENANCE_MODE=true 가 예전 .env.production.local 에 남은 경우에만 여기서 동작.
//   /api/health 는 통과 → 모니터/헬스가 점검 중에도 살아있어 업타임 알림 오발 방지.
//   deploy/maintenance.sh off 가 legacy 값을 false 로 정리한 뒤 nginx 플래그를 해제한다.
const MAINTENANCE_ALLOW = new Set<string>(["/api/health"]);

// 숙소 콘텐츠를 다시 공개할 때 lifeCrafting.ts의 LIFE_HOUSING_ENABLED와 함께 연다.
// 페이지 내부 notFound()는 스트리밍 응답에서 HTTP 200 소프트 404가 될 수 있으므로,
// 비공개 기간에는 Proxy에서 페이지와 API 모두 실제 404로 먼저 차단한다.
const LIFE_HOUSING_ROUTES_ENABLED = false;

function isLifeHousingRoute(pathname: string): boolean {
  return (
    pathname === "/character/room" ||
    pathname === "/api/v2/me/housing" ||
    /^\/character\/[^/]+\/room\/?$/.test(pathname) ||
    /^\/api\/v2\/player\/[^/]+\/housing\/?$/.test(pathname)
  );
}

// 점검 중 보일 HTML. CLOSED_HTML 과 동일 톤(니어블랙·미니멀·이모지 없음). 앱 의존 없이 인라인.
const MAINTENANCE_HTML = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex,nofollow" />
<title>잠시 점검 중입니다 — 무슨무슨게임</title>
<style>
  html,body{margin:0;padding:0;height:100%;background:#09090b;color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
  main{min-height:100%;display:flex;align-items:center;justify-content:center;padding:1.5rem;box-sizing:border-box}
  .box{width:min(100%,32rem);box-sizing:border-box;padding:2.75rem 2rem;text-align:center;background:#18181b;border:1px solid #3f3f46;border-radius:1rem;box-shadow:0 1.5rem 4rem rgba(0,0,0,.4)}
  .status{display:inline-flex;align-items:center;gap:.5rem;margin-bottom:1.25rem;padding:.4rem .75rem;border:1px solid #3f3f46;border-radius:999px;color:#d4d4d8;font-size:.75rem;font-weight:700;letter-spacing:.04em}
  .status::before{content:"";width:.45rem;height:.45rem;border-radius:50%;background:#f59e0b;box-shadow:0 0 0 .2rem rgba(245,158,11,.14)}
  h1{font-size:clamp(1.6rem,6vw,2rem);font-weight:800;letter-spacing:-.035em;margin:0}
  .lead{margin:1rem 0 0;color:#d4d4d8;font-size:1rem;font-weight:600;line-height:1.7}
  .divider{width:3rem;height:1px;margin:1.5rem auto;background:#3f3f46}
  .note{margin:0;color:#a1a1aa;font-size:.875rem;line-height:1.75}
  @media (max-width:30rem){main{padding:1rem}.box{padding:2.25rem 1.35rem;border-radius:.875rem}}
</style>
</head>
<body>
<main>
  <div class="box" role="status" aria-live="polite">
    <div class="status">서비스 점검</div>
    <h1>잠시 점검 중입니다</h1>
    <p class="lead">업데이트 및 오류 수정을 위해<br />잠시 점검하고 있습니다.</p>
    <div class="divider" aria-hidden="true"></div>
    <p class="note">
      점검 시간은 8월 17일 04시부터 06시까지, 총 2시간입니다.<br />
      잠시만 기다려 주세요.
    </p>
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
  html,body{margin:0;padding:0;height:100%;background:#09090b;color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
  main{min-height:100%;display:flex;align-items:center;justify-content:center;padding:1.5rem;box-sizing:border-box}
  .box{width:min(100%,32rem);box-sizing:border-box;padding:2.75rem 2rem;text-align:center;background:#18181b;border:1px solid #3f3f46;border-radius:1rem;box-shadow:0 1.5rem 4rem rgba(0,0,0,.4)}
  .status{display:inline-flex;align-items:center;gap:.5rem;margin-bottom:1.25rem;padding:.4rem .75rem;border:1px solid #3f3f46;border-radius:999px;color:#d4d4d8;font-size:.75rem;font-weight:700;letter-spacing:.04em}
  .status::before{content:"";width:.45rem;height:.45rem;border-radius:50%;background:#71717a;box-shadow:0 0 0 .2rem rgba(113,113,122,.16)}
  h1{font-size:clamp(1.6rem,6vw,2rem);font-weight:800;letter-spacing:-.035em;margin:0}
  .lead{margin:1rem 0 0;color:#d4d4d8;font-size:1rem;font-weight:600;line-height:1.7}
  .divider{width:3rem;height:1px;margin:1.5rem auto;background:#3f3f46}
  .note{margin:0;color:#a1a1aa;font-size:.875rem;line-height:1.75}
  @media (max-width:30rem){main{padding:1rem}.box{padding:2.25rem 1.35rem;border-radius:.875rem}}
</style>
</head>
<body>
<main>
  <div class="box" role="status" aria-live="polite">
    <div class="status">테스트 서버</div>
    <h1>현재는 운영 중이 아닙니다</h1>
    <p class="lead">외부 테스트를 잠시 닫아두었어요.</p>
    <div class="divider" aria-hidden="true"></div>
    <p class="note">다음 테스트가 시작되면<br />다시 안내드리겠습니다.</p>
  </div>
</main>
</body>
</html>`;

export default auth((req) => {
  if (
    !LIFE_HOUSING_ROUTES_ENABLED &&
    isLifeHousingRoute(req.nextUrl.pathname)
  ) {
    return new NextResponse(null, {
      status: 404,
      headers: { "cache-control": "no-store" },
    });
  }

  const isCoinShopRoute =
    req.nextUrl.pathname === "/settings/coin-shop" ||
    req.nextUrl.pathname === "/api/v2/museun-coin-shop" ||
    req.nextUrl.pathname.startsWith("/api/v2/museun-coin-shop/");
  if (
    isCoinShopRoute &&
    !canPassMuseunCoinShopProxy(req.auth?.user, process.env)
  ) {
    return new NextResponse(null, {
      status: 404,
      headers: { "cache-control": "private, no-store" },
    });
  }

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

  if (isApiRequestBodyTooLarge(req, req.nextUrl.pathname)) {
    return NextResponse.json(
      { ok: false, error: "payload_too_large" },
      { status: 413 },
    );
  }

  // 비로그인 루트 요청은 라우트가 렌더링되기 전에 공개 대문으로 이동시킨다.
  // page의 redirect()는 스트리밍이 먼저 시작되면 200 + 클라이언트 이동이 될 수 있어,
  // 검색 로봇에도 명확한 HTTP 307 응답을 주려면 이 단계에서 처리해야 한다.
  if (req.nextUrl.pathname === "/" && !req.auth?.user) {
    return NextResponse.redirect(new URL("/sign-in", req.url));
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|txt|xml|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
