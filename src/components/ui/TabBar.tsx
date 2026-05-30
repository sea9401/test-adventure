"use client";

import type { ReactNode } from "react";

type TabSize = "sm" | "md" | "lg";
// underline: 기존 밑줄 탭(v1 전반). highlight: nav 바 레일은 유지하고 호버/선택 시 글자 색만 인디고로(v2 게임 탭).
type TabVariant = "underline" | "highlight";

const SIZE: Record<TabSize, string> = {
  sm: "px-3 py-2 text-sm font-medium",
  md: "px-4 py-2 text-base font-semibold",
  lg: "px-5 py-2.5 text-lg font-semibold",
};

const CONTAINER: Record<TabVariant, string> = {
  underline: "flex gap-1 border-b border-zinc-200 dark:border-zinc-800",
  highlight: "flex gap-1 border-b border-zinc-200 dark:border-zinc-800",
};

const TAB_BASE: Record<TabVariant, string> = {
  underline: "-mb-px border-b-2",
  highlight: "",
};

const TAB_STATE: Record<TabVariant, { active: string; inactive: string }> = {
  underline: {
    active: "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100",
    inactive:
      "border-transparent text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100",
  },
  // 박스(테두리·배경) 없이 글자 색만 — 선택은 진한 인디고, 호버는 옅은 인디고, 기본은 중립 회색.
  highlight: {
    active: "text-indigo-700 dark:text-indigo-300",
    inactive:
      "text-zinc-500 hover:text-indigo-500 dark:text-zinc-400 dark:hover:text-indigo-400",
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
