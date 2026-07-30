"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  BookOpen,
  ChartBar,
  ChatCenteredText,
  ChatsCircle,
  CoinVertical,
  EnvelopeSimple,
  Eye,
  EyeSlash,
  FileText,
  Gift,
  List,
  Megaphone,
  Moon,
  Palette,
  SignOut,
  Storefront,
  Sun,
  UserMinus,
} from "@phosphor-icons/react";
import { signOut } from "next-auth/react";
import { SURFACE_CARD } from "@/components/ui/surfaces";
import {
  DISCREET_MODE_CLASS,
  DISCREET_MODE_STORAGE_KEY,
  DISCREET_MODE_STORED_VALUE,
} from "./discreetMode";

// v2 상단바 우측 설정 메뉴 — 광장(게시판/랭킹/전체 소식/거래소/우편함) + 게임 안내서 +
// 다크 토글 + 로그아웃/회원탈퇴. 옛 광장 탭은 모바일에서 탭바 밖으로 밀려 안 보여
// 이 메뉴로 통째 이관(사용자 결정 2026-06-13) — /plaza/* 라우트는 그대로.
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
  const [discreetMode, setDiscreetMode] = useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const initial = document.documentElement.classList.contains("dark")
      ? "dark"
      : "light";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(initial);
    setDiscreetMode(
      document.documentElement.classList.contains(DISCREET_MODE_CLASS),
    );
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

  const toggleDiscreetMode = () => {
    const next = !discreetMode;
    setDiscreetMode(next);
    document.documentElement.classList.toggle(DISCREET_MODE_CLASS, next);
    try {
      if (next) {
        localStorage.setItem(
          DISCREET_MODE_STORAGE_KEY,
          DISCREET_MODE_STORED_VALUE,
        );
      } else {
        localStorage.removeItem(DISCREET_MODE_STORAGE_KEY);
      }
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
        // 광장+설정이 함께 들어있어 "설정"으로만 오인되던 톱니 → 햄버거 "메뉴"로(사용자 피드백).
        aria-label="메뉴"
        title="메뉴"
        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        <List size={20} weight="bold" />
      </button>
      {open && (
        <div
          className={`${SURFACE_CARD} ui-dropdown-reveal absolute right-0 top-full z-[70] mt-2 w-[min(12rem,calc(100vw-2rem))] origin-top-right overflow-hidden shadow-lg`}
        >
          <ul className="py-1">
            {(
              [
                { href: "/plaza/bulletin", label: "게시판", Icon: ChatsCircle },
                { href: "/plaza/rankings", label: "랭킹", Icon: ChartBar },
                { href: "/plaza/feed", label: "전체 소식", Icon: Megaphone },
                { href: "/plaza/market", label: "거래소", Icon: Storefront },
                { href: "/plaza/inbox", label: "우편함", Icon: EnvelopeSimple },
              ] as const
            ).map(({ href, label, Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  onClick={() => setOpen(false)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-zinc-800 transition-colors hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  <Icon size={18} weight="duotone" />
                  {label}
                </Link>
              </li>
            ))}
          </ul>
          <div
            role="separator"
            className="mx-3 my-1 border-t border-zinc-200 dark:border-zinc-700"
          />
          <ul className="py-1">
            <li>
              <Link
                href="/settings/cosmetics"
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium text-violet-700 transition-colors hover:bg-violet-50 dark:text-violet-300 dark:hover:bg-violet-950"
              >
                <Palette size={18} weight="duotone" />
                꾸미기
              </Link>
            </li>
            <li>
              <Link
                href="/settings/events"
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950"
              >
                <Gift size={18} weight="duotone" />
                이벤트
              </Link>
            </li>
            {process.env.NEXT_PUBLIC_MUSEUN_COIN_SHOP_OPEN === "true" && (
              <li>
                <Link
                  href="/settings/coin-shop"
                  onClick={() => setOpen(false)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950"
                >
                  <CoinVertical size={18} weight="duotone" />
                  무슨 코인 상점
                </Link>
              </li>
            )}
            <li>
              <Link
                href="/manual"
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-zinc-800 transition-colors hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                <BookOpen size={18} weight="duotone" />
                게임 안내서
              </Link>
            </li>
            <li>
              <Link
                href="/privacy"
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-zinc-800 transition-colors hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                <FileText size={18} weight="duotone" />
                정책·약관
              </Link>
            </li>
          </ul>
          <ul className="border-t border-zinc-200 py-1 dark:border-zinc-700">
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
              <button
                type="button"
                onClick={toggleDiscreetMode}
                aria-pressed={discreetMode}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-800 transition-colors hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                {discreetMode ? (
                  <Eye size={18} weight="duotone" />
                ) : (
                  <EyeSlash size={18} weight="duotone" />
                )}
                <span className="min-w-0">
                  <span className="block">
                    {discreetMode ? "은신 모드 해제" : "은신 모드"}
                  </span>
                  <span className="block text-[10px] leading-4 text-zinc-500 dark:text-zinc-400">
                    배경·화려한 장식 숨김
                  </span>
                </span>
              </button>
            </li>
            <li>
              <Link
                href="/feedback"
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-zinc-800 transition-colors hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                <ChatCenteredText size={18} weight="duotone" />
                건의사항
              </Link>
            </li>
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
