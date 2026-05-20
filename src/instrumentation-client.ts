import { isStaleBuildError, reloadForStaleBuild } from "@/lib/staleBuild";

// Next 16 instrumentation-client — 하이드레이션 전에 실행돼 전역 에러를 가장 먼저 잡는다.
// 재배포 후 구버전 탭이 청크 로드에 실패하면(ChunkLoadError) 새 빌드를 받아 자동 복구.
// 자세한 배경·루프 가드는 src/lib/staleBuild.ts 참고.
if (typeof window !== "undefined") {
  window.addEventListener("error", (event) => {
    if (isStaleBuildError(event.error ?? event.message)) reloadForStaleBuild();
  });
  window.addEventListener("unhandledrejection", (event) => {
    if (isStaleBuildError(event.reason)) reloadForStaleBuild();
  });
}
