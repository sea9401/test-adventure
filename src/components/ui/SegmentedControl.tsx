"use client";

import type { ReactNode } from "react";

/** 칸마다 뜻이 다른 선택지(노말·하드 같은 난이도)에 까는 바탕색. 초록=무난, 로즈=위험. */
export type SegmentedTone = "safe" | "danger";

const TONE_CLASS: Record<SegmentedTone, { idle: string; selected: string }> = {
  safe: {
    idle: "bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:bg-zinc-900 dark:text-emerald-300 dark:hover:bg-zinc-950",
    selected: "bg-emerald-100 text-emerald-900 shadow-sm ring-2 ring-inset ring-emerald-500 dark:bg-zinc-950 dark:text-emerald-200",
  },
  danger: {
    idle: "bg-rose-50 text-rose-800 hover:bg-rose-100 dark:bg-zinc-900 dark:text-rose-300 dark:hover:bg-zinc-950",
    selected: "bg-rose-100 text-rose-900 shadow-sm ring-2 ring-inset ring-rose-500 dark:bg-zinc-950 dark:text-rose-200",
  },
};

// 화면 안에서 보기를 바꾸는 2~4개 선택지(예: 허수아비 연습 / 유저 친선전).
//   화면 자체를 나누는 탭은 TabBar(밑줄)를 쓰고, 이 둘을 섞어 3단으로 쌓지 않는다.
export function SegmentedControl<K extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: {
  options: ReadonlyArray<{ key: K; label: ReactNode; tone?: SegmentedTone }>;
  /** null이면 아무것도 고르지 않은 상태로 보여 준다(선택을 강제할 때). */
  value: K | null;
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
        const tone = option.tone ? TONE_CLASS[option.tone] : null;
        return (
          <button
            key={option.key}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.key)}
            className={`min-h-10 flex-1 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
              tone
                ? selected ? tone.selected : tone.idle
                : selected
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
