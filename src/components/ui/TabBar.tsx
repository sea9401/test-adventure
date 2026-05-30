"use client";

import type { ReactNode } from "react";

type TabSize = "sm" | "md";
// underline: 기존 밑줄 탭(v1 전반). chip: 흰색 기본 + 호버/선택 시 인디고 하이라이트(v2 게임 탭).
type TabVariant = "underline" | "chip";

const SIZE: Record<TabSize, string> = {
  sm: "px-3 py-2 text-sm font-medium",
  md: "px-4 py-2 text-base font-semibold",
};

const CONTAINER: Record<TabVariant, string> = {
  underline: "flex gap-1 border-b border-zinc-200 dark:border-zinc-800",
  chip: "flex gap-1.5",
};

const TAB_BASE: Record<TabVariant, string> = {
  underline: "-mb-px border-b-2",
  chip: "rounded-md border",
};

const TAB_STATE: Record<TabVariant, { active: string; inactive: string }> = {
  underline: {
    active: "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100",
    inactive:
      "border-transparent text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100",
  },
  chip: {
    active:
      "border-indigo-300 bg-indigo-100 text-indigo-700 dark:border-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-200",
    inactive:
      "border-zinc-200 bg-white text-zinc-600 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-indigo-800 dark:hover:bg-indigo-950/40 dark:hover:text-indigo-200",
  },
};

export type TabBarProps<K extends string> = {
  tabs: ReadonlyArray<{ key: K; label: string; icon?: ReactNode }>;
  active: K;
  onChange: (next: K) => void;
  ariaLabel: string;
  size?: TabSize;
  variant?: TabVariant;
  className?: string;
  // 탭이 많아 화면을 넘칠 때 줄바꿈 대신 가로 스크롤. 모바일에서 7+ 탭이 세로로 깨지는 걸 방지.
  scrollable?: boolean;
};

export function TabBar<K extends string>({
  tabs,
  active,
  onChange,
  ariaLabel,
  size = "sm",
  variant = "underline",
  className,
  scrollable = false,
}: TabBarProps<K>) {
  const cls = [
    CONTAINER[variant],
    scrollable
      ? "no-scrollbar flex-nowrap overflow-x-auto"
      : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <nav role="tablist" aria-label={ariaLabel} className={cls}>
      {tabs.map((t) => {
        const selected = active === t.key;
        const state = TAB_STATE[variant];
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={selected}
            type="button"
            onClick={() => onChange(t.key)}
            className={`shrink-0 whitespace-nowrap ${TAB_BASE[variant]} ${SIZE[size]} transition-colors ${
              selected ? state.active : state.inactive
            }`}
          >
            {t.icon ? (
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="inline-flex shrink-0">
                  {t.icon}
                </span>
                {t.label}
              </span>
            ) : (
              t.label
            )}
          </button>
        );
      })}
    </nav>
  );
}
