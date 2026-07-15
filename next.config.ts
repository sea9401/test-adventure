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

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_ID: BUILD_ID,
  },
  // 서비스 워커는 항상 최신 버전을 받아야 — 캐싱하면 옛 SW 가 활성화된 채로 남는다.
  // /public/sw.js 는 Next.js 가 자동 정적 서빙 — 헤더만 보강.
  async headers() {
    return [
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
