import type { NextAuthConfig } from "next-auth";
import Kakao from "next-auth/providers/kakao";
import { AUTH_LOGOUT_GUARD_COOKIE } from "@/lib/authSessionConfig";
import {
  AGE_ELIGIBILITY_COOKIE,
  canAccessMinimumAgeService,
} from "@/lib/ageEligibility";

export const PUBLIC_PATHS = [
  "/sign-in",
  "/r",             // 개인 홍보 링크 — 유입 쿠키를 기록한 뒤 공개 대문으로 이동
  "/manual",       // 게임 가이드 — 정적 콘텐츠(세션 비의존). 대문에서 잠재 유저가 미리보게 공개.
  "/terms",        // 이용약관
  "/privacy",      // 개인정보처리방침
  "/operations",   // 운영정책
  "/licenses",     // 오픈소스 고지
  "/game-info",    // 게임 등급정보 — 로그인·연령 확인 전에도 공개
  "/notices/minimum-age-policy", // 만 14세 이상 서비스 기준 변경 사전 공지
  "/robots.txt",   // 검색 로봇 수집 규칙
  "/sitemap.xml",  // 공개 대문·게임 가이드 URL 목록
  "/api/auth",     // Auth.js OAuth 콜백 — Proxy 통과 필수
  "/api/age-eligibility", // 만 14세 이상 자기확인 쿠키 발급
  "/api/health",
  "/api/version",
  "/api/chat/cleanup",
  "/api/cron", // 스케줄러(EC2 crontab / Vercel crons) 호출 — 라우트 자체가 CRON_SECRET 을 검사
  // 개발/프리뷰 전용 UI 프리뷰 라우트(/dev/*) — 로그인 없이 컴포넌트 확인용.
  // production 빌드에선 이 항목 자체가 컴파일 타임에 빠지고(NODE_ENV 정적 치환),
  // 라우트 페이지도 production 에서 notFound() 라 운영(msmsge.com)엔 절대 노출 안 됨.
  ...(process.env.NODE_ENV === "production" ? [] : ["/dev"]),
  // 닫힌 코인 상점은 인증 리다이렉트보다 Route Handler/page의 404가 먼저 보이게
  // 공개 경계로 통과시킨다. 상점을 열면 다시 인증 필수 경로가 된다.
  ...(process.env.NEXT_PUBLIC_MUSEUN_COIN_SHOP_OPEN === "true"
    ? []
    : ["/settings/coin-shop", "/api/v2/museun-coin-shop"]),
];

export function isAuthorizedRequest(
  pathname: string,
  authenticated: boolean,
  loggedOut: boolean,
  ageEligible = false,
): boolean {
  // OAuth·Credentials 시작점과 callback은 로그인 전 요청이므로 세션을 요구할 수 없다.
  // 대신 연령 확인을 먼저 요구해 Auth.js 주소 직접 호출로 사전 확인을 우회하지 못하게 한다.
  const isAuthenticationEntry = ["/api/auth/signin", "/api/auth/callback"].some(
    (path) => pathname === path || pathname.startsWith(path + "/"),
  );
  if (isAuthenticationEntry) return ageEligible;

  const isPublic = PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(path + "/"),
  );
  if (isPublic) return true;
  return authenticated && !loggedOut && ageEligible;
}

// Proxy 전용 설정 — adapter 없이 edge-compatible.
// 실제 DB/OAuth 처리는 src/auth.ts (full config).
export const authConfig: NextAuthConfig = {
  providers: [Kakao],
  pages: { signIn: "/sign-in" },
  callbacks: {
    // Proxy의 심의용 상점 게이트가 JWT subject를 계정 allowlist와 비교할 수 있게 한다.
    // full auth 설정(src/auth.ts)도 같은 매핑을 유지한다.
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
    authorized({ auth, request }) {
      return isAuthorizedRequest(
        request.nextUrl.pathname,
        !!auth?.user,
        request.cookies.has(AUTH_LOGOUT_GUARD_COOKIE),
        canAccessMinimumAgeService(
          request.cookies.get(AGE_ELIGIBILITY_COOKIE)?.value,
          process.env.AUTH_SECRET,
        ),
      );
    },
  },
};
