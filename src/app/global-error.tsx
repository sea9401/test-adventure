"use client";

import { useEffect } from "react";
import { isStaleBuildError, reloadForStaleBuild } from "@/lib/staleBuild";

// 루트 에러 경계. 렌더 중 청크 로드 실패 등 React 가 잡는 에러가 여기로 온다.
// 재배포로 인한 stale-build 에러면 새 빌드를 받아 1회 자동 새로고침(staleBuild.ts).
// 그 외 진짜 에러는 최소 UI + 다시 시도. global-error 는 root layout 을 대체하므로
// 직접 <html>/<body> 를 렌더해야 한다.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (isStaleBuildError(error)) reloadForStaleBuild();
  }, [error]);

  return (
    <html lang="ko">
      <body className="min-h-screen flex flex-col items-center justify-center gap-4 bg-zinc-50 p-6 dark:bg-zinc-950">
        <div className="max-w-sm text-center">
          <div className="text-base font-medium text-zinc-900 dark:text-zinc-100">
            문제가 발생했습니다
          </div>
          <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            잠시 후 다시 시도해 주세요. 계속되면 새로고침 해보세요.
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            다시 시도
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            새로고침
          </button>
        </div>
      </body>
    </html>
  );
}
