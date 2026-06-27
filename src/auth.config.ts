import type { NextAuthConfig } from "next-auth";
import Kakao from "next-auth/providers/kakao";

const PUBLIC_PATHS = [
  "/sign-in",
  "/manual",       // 게임 가이드 — 정적 콘텐츠(세션 비의존). 대문에서 잠재 유저가 미리보게 공개.
  "/api/auth",     // Auth.js OAuth 콜백 — 미들웨어 통과 필수
  "/api/health",
  "/api/version",
  "/api/chat/cleanup",
  "/api/cron", // 스케줄러(EC2 crontab / Vercel crons) 호출 — 라우트 자체가 CRON_SECRET 을 검사
  // 개발/프리뷰 전용 UI 프리뷰 라우트(/dev/*) — 로그인 없이 컴포넌트 확인용.
  // production 빌드에선 이 항목 자체가 컴파일 타임에 빠지고(NODE_ENV 정적 치환),
  // 라우트 페이지도 production 에서 notFound() 라 운영(msmsge.com)엔 절대 노출 안 됨.
  ...(process.env.NODE_ENV === "production" ? [] : ["/dev"]),
];

// 미들웨어 전용 설정 — adapter 없이 edge-compatible.
// 실제 DB/OAuth 처리는 src/auth.ts (full config).
export const authConfig: NextAuthConfig = {
  // 베타 동안 구글 로그인 제외 — 카카오만. (구글 재도입 시 Google import + 배열·sign-in 버튼 복원)
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
