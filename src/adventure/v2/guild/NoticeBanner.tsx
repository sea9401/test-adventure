import type { Notice } from "./guildShared";

// 가입 신청·수락 등 액션 결과를 알리는 인라인 배너. v2 길드 탭 전용(공용 토스트 없음).
export function NoticeBanner({ notice }: { notice: Notice }) {
  const ok = notice.kind === "ok";
  return (
    <div
      role="status"
      className={
        ok
          ? "rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300"
          : "rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300"
      }
    >
      {notice.text}
    </div>
  );
}
