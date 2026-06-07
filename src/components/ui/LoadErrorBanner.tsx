"use client";

// 뷰 초기 로드(fetch) 실패 시 표시하는 공용 배너 — 옛날엔 catch {} 로 삼켜 빈/0 화면만 떴다.
//   네트워크 실패를 알리고 재시도 버튼을 준다. role="alert" 로 스크린리더에도 안내.
export function LoadErrorBanner({
  onRetry,
  message = "데이터를 불러오지 못했습니다.",
}: {
  onRetry: () => void;
  message?: string;
}) {
  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-2 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-300"
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={onRetry}
        className="shrink-0 rounded border border-rose-400 px-2 py-0.5 text-xs font-medium hover:bg-rose-100 dark:border-rose-600 dark:hover:bg-rose-900"
      >
        다시 시도
      </button>
    </div>
  );
}
