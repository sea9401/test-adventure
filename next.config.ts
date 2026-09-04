import type { NextConfig } from "next";
import { execSync } from "node:child_process";

// 클라이언트 번들 + 서버 런타임에 박히는 빌드 식별자 — VersionCheck 가 /api/version 응답과
// 비교해 새 배포를 감지한다. NEXT_PUBLIC_* 는 빌드 시점에 인라인되므로 "로드한 빌드의 ID" 가
// 클라 번들에, "현재 배포의 ID" 가 서버 process.env 에 박힌다. 우선순위:
//   1) BUILD_ID — 배포 파이프라인이 명시적으로 주입 (가장 확실)
//   2) VERCEL_GIT_COMMIT_SHA / VERCEL_DEPLOYMENT_ID — Vercel 호환 (현재 AWS 라 보통 없음)
//   3) 빌드 시점 git HEAD SHA — AWS/EC2 의 `git pull && npm run build` 흐름
//   4) "dev" — git 도 없으면 (임시/로컬 빌드) → VersionCheck 가 비교를 건너뛴다.
function resolveBuildId(): string {
  const fromEnv =
    process.env.BUILD_ID ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.VERCEL_DEPLOYMENT_ID;
  if (fromEnv) return fromEnv;
  try {
    return execSync("git rev-parse --short HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return "dev";
  }
}

const BUILD_ID = resolveBuildId();

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self' https://kauth.kakao.com",
  // Next hydration과 초기 테마 스크립트 때문에 inline script/style은 현재 허용한다.
  // 외부 실행 출처는 사람 확인 공급자로 한정한다.
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://js.hcaptcha.com https://*.hcaptcha.com",
  "style-src 'self' 'unsafe-inline' https://*.hcaptcha.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://challenges.cloudflare.com https://*.hcaptcha.com https://*.tosspayments.com",
  "frame-src https://challenges.cloudflare.com https://*.hcaptcha.com https://*.tosspayments.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  ...(process.env.NODE_ENV === "production"
    ? ["upgrade-insecure-requests"]
    : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
];

const nextConfig: NextConfig = {
  // 모바일 UI 회귀 테스트는 실행 중인 기본 개발 서버의 .next 잠금/캐시와 격리한다.
  // 환경 변수가 없으면 모든 일반 개발·빌드가 기존 .next 를 그대로 사용한다.
  distDir: process.env.MOBILE_UI_NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  images: {
    localPatterns: [
      // Next 16은 쿼리가 붙은 로컬 이미지를 기본 차단한다. 기존 정적 에셋은
      // 쿼리 없이 허용하고, 프로필 썸네일 캐시 갱신용 버전만 정확히 연다.
      { pathname: "/**", search: "" },
      { pathname: "/api/profile/image/**", search: "?v=2" },
    ],
  },
  env: {
    NEXT_PUBLIC_BUILD_ID: BUILD_ID,
  },
  // PR 필수 CI가 tsc --noEmit 을 별도로 통과시킨다. 저메모리 EC2에서 next build 의
  // 중복 타입 검사가 장시간 swap 에 빠지는 것을 막고, 컴파일·프리렌더만 수행한다.
  typescript: {
    ignoreBuildErrors: true,
  },
  // 서비스 워커는 항상 최신 버전을 받아야 — 캐싱하면 옛 SW 가 활성화된 채로 남는다.
  // /public/sw.js 는 Next.js 가 자동 정적 서빙 — 헤더만 보강.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
