import { ArrowLeft } from "@phosphor-icons/react";

// 모든 v2 화면 공용 "뒤로" 버튼 — 모양 통일(테두리 + ArrowLeft + "뒤로").
// SubViewHeader 와 각 화면의 인라인 뒤로 버튼이 전부 이 하나를 쓴다.
export function BackButton({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="뒤로"
      className={`inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800${
        className ? ` ${className}` : ""
      }`}
    >
      <ArrowLeft size={16} weight="bold" />
      뒤로
    </button>
  );
}
