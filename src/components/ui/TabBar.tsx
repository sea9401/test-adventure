"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

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
  const navRef = useRef<HTMLElement>(null);
  // 가로 스크롤 시 좌/우 끝 도달 여부 — 안 닿은(=넘치는) 쪽 가장자리를 페이드해 "더 있음"을 알린다.
  // scrollbar 를 숨겨(no-scrollbar) 잘린 탭이 마지막처럼 보이던 문제(예: 6번째 "광장")를 해소.
  const [edges, setEdges] = useState({ left: false, right: false });

  const updateEdges = useCallback(() => {
    const el = navRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    const left = el.scrollLeft > 1;
    const right = el.scrollLeft < maxScroll - 1;
    setEdges((prev) =>
      prev.left === left && prev.right === right ? prev : { left, right },
    );
  }, []);

  useEffect(() => {
    if (!scrollable) return;
    const el = navRef.current;
    if (!el) return;
    updateEdges();
    el.addEventListener("scroll", updateEdges, { passive: true });
    window.addEventListener("resize", updateEdges);
    return () => {
      el.removeEventListener("scroll", updateEdges);
      window.removeEventListener("resize", updateEdges);
    };
  }, [scrollable, updateEdges, tabs.length]);

  const cls = [
    CONTAINER[variant],
    scrollable ? "no-scrollbar flex-nowrap overflow-x-auto" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  // 가장자리 페이드 마스크 — 넘치는 쪽만 흐린다. 둘 다 끝이면(안 넘침) 마스크 없음(데스크톱 등).
  const fadeStyle: CSSProperties = {};
  if (scrollable && (edges.left || edges.right)) {
    const leftStops = edges.left ? "transparent 0, black 24px" : "black 0, black 24px";
    const rightStops = edges.right
      ? "black calc(100% - 24px), transparent 100%"
      : "black calc(100% - 24px), black 100%";
    const mask = `linear-gradient(to right, ${leftStops}, ${rightStops})`;
    fadeStyle.maskImage = mask;
    fadeStyle.WebkitMaskImage = mask;
  }

  return (
    <nav
      ref={navRef}
      role="tablist"
      aria-label={ariaLabel}
      className={cls}
      style={fadeStyle}
    >
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
