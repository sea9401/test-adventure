"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  Gear,
  Moon,
  Sun,
} from "@phosphor-icons/react";

// v2 상단바 우측 설정 메뉴 — 메뉴얼 + 라이트/다크 토글만. 라이브 SettingsMenu 보다 경량.
// 테마 토글 패턴: documentElement.classList + localStorage("theme").

export function V2SettingsMenu() {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const initial = document.documentElement.classList.contains("dark")
      ? "dark"
      : "light";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(initial);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem("theme", next);
    } catch {}
  };

  const isDark = theme === "dark";

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="설정"
        title="설정"
        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        <Gear size={18} weight="duotone" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-[min(12rem,calc(100vw-2rem))] origin-top-right overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-800 dark:bg-zinc-950">
          <div className="border-b border-zinc-200 px-3 py-2 text-xs uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            설정
          </div>
          <ul className="py-1">
            <li>
              <button
                type="button"
                onClick={toggleTheme}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-zinc-800 transition-colors hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                {isDark ? (
                  <Sun size={18} weight="duotone" />
                ) : (
                  <Moon size={18} weight="duotone" />
                )}
                {isDark ? "라이트 모드" : "다크 모드"}
              </button>
            </li>
            <li>
              <Link
                href="/manual"
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-zinc-800 transition-colors hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                <BookOpen size={18} weight="duotone" />
                메뉴얼
              </Link>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
