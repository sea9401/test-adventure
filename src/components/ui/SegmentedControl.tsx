"use client";

import type { ReactNode } from "react";

// 화면 안에서 보기를 바꾸는 2~4개 선택지(예: 허수아비 연습 / 유저 친선전).
//   화면 자체를 나누는 탭은 TabBar(밑줄)를 쓰고, 이 둘을 섞어 3단으로 쌓지 않는다.
export function SegmentedControl<K extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: {
  options: ReadonlyArray<{ key: K; label: ReactNode }>;
  value: K;
  onChange: (key: K) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={[
        "flex gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {options.map((option) => {
        const selected = option.key === value;
        return (
          <button
            key={option.key}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.key)}
            className={`min-h-10 flex-1 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
              selected
                ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-zinc-100"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
