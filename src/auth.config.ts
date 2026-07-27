import type { NextAuthConfig } from "next-auth";
import Kakao from "next-auth/providers/kakao";

export const PUBLIC_PATHS = [
  "/sign-in",
  "/r",             // 개인 홍보 링크 — 유입 쿠키를 기록한 뒤 공개 대문으로 이동
  "/manual",       // 게임 가이드 — 정적 콘텐츠(세션 비의존). 대문에서 잠재 유저가 미리보게 공개.
  "/terms",        // 이용약관
  "/privacy",      // 개인정보처리방침
  "/operations",   // 운영정책
  "/robots.txt",   // 검색 로봇 수집 규칙
  "/sitemap.xml",  // 공개 대문·게임 가이드 URL 목록
  "/api/auth",     // Auth.js OAuth 콜백 — Proxy 통과 필수
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

// Proxy 전용 설정 — adapter 없이 edge-compatible.
// 실제 DB/OAuth 처리는 src/auth.ts (full config).
export const authConfig: NextAuthConfig = {
  providers: [Kakao],
  pages: { signIn: "/sign-in" },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isPublic = PUBLIC_PATHS.some(
        (p) => nextUrl.pathname === p || nextUrl.pathname.startsWith(p + "/"),
      );
      if (isPublic) return true;
      return !!auth?.user;
    },
  },
};
