import { CaretRight, LockSimple } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { SURFACE_CARD } from "./surfaces";

export function EntryCard({
  icon,
  title,
  description,
  locked,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  /** 해금 조건 문구. 주면 설명 대신 자물쇠와 조건을 보여 준다(EntryRow와 같은 규칙). */
  locked?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-locked={locked ? "true" : undefined}
      className={`${SURFACE_CARD} flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800`}
    >
      <span
        aria-hidden
        className="flex shrink-0 items-center justify-center text-zinc-700 dark:text-zinc-200"
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-base font-medium ${locked ? "text-zinc-500 dark:text-zinc-400" : "text-zinc-900 dark:text-zinc-100"}`}>
          {title}
        </span>
        {locked ? (
          <span className="flex items-center gap-1 truncate text-sm text-zinc-500 dark:text-zinc-400">
            <LockSimple size={14} weight="bold" aria-hidden className="shrink-0" />
            {locked}
          </span>
        ) : description ? (
          <span className="block truncate text-sm text-zinc-500 dark:text-zinc-400">
            {description}
          </span>
        ) : null}
      </span>
      <CaretRight
        size={16}
        weight="bold"
        aria-hidden
        className="shrink-0 text-zinc-400 dark:text-zinc-500"
      />
    </button>
  );
}
