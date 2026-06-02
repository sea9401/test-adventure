"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  BookOpen,
  Gear,
  Moon,
  SignOut,
  Sun,
  UserMinus,
} from "@phosphor-icons/react";
import { signOut } from "next-auth/react";

// v2 상단바 우측 설정 메뉴 — 메뉴얼 + 다크 토글 + 로그아웃/회원탈퇴.
// 테마 토글 패턴: documentElement.classList + localStorage("theme").
// 회원 탈퇴 모달은 거의 안 눌리는 보조 UI라 클릭 시점에 동적 로드(ssr:false).
const DeleteAccountModal = dynamic(
  () =>
    import("@/components/DeleteAccountModal").then((m) => ({
      default: m.DeleteAccountModal,
    })),
  { ssr: false },
);

export function V2SettingsMenu({ gameName }: { gameName: string | null }) {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
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

  const handleSignOut = () => {
    setOpen(false);
    signOut({ redirectTo: "/sign-in" });
  };

  const handleOpenDeleteAccount = () => {
    setOpen(false);
    setDeleteAccountOpen(true);
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
          <ul className="border-t border-zinc-200 py-1 dark:border-zinc-800">
            <li>
              <button
                type="button"
                onClick={handleSignOut}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-rose-600 transition-colors hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
              >
                <SignOut size={18} weight="duotone" />
                로그아웃
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={handleOpenDeleteAccount}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:text-zinc-600 dark:hover:bg-zinc-900 dark:hover:text-zinc-400"
              >
                <UserMinus size={14} weight="duotone" />
                회원 탈퇴
              </button>
            </li>
          </ul>
        </div>
      )}
      {deleteAccountOpen && (
        <DeleteAccountModal
          gameName={gameName}
          onClose={() => setDeleteAccountOpen(false)}
        />
      )}
    </div>
  );
}
