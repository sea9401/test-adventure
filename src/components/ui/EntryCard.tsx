import { CaretRight } from "@phosphor-icons/react";
import type { ReactNode } from "react";

export function EntryCard({
  icon,
  title,
  description,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-left shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
    >
      <span
        aria-hidden
        className="flex shrink-0 items-center justify-center text-zinc-700 dark:text-zinc-200"
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-medium text-zinc-900 dark:text-zinc-100">
          {title}
        </span>
        <span className="block truncate text-sm text-zinc-500 dark:text-zinc-400">
          {description}
        </span>
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
