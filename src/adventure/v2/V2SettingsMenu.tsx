"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  ChartBar,
  ChatCenteredText,
  ChatsCircle,
  CoinVertical,
  EnvelopeSimple,
  GearSix,
  Gift,
  List,
  Megaphone,
  Palette,
  SignOut,
  Storefront,
} from "@phosphor-icons/react";
import { signOut } from "next-auth/react";
import { SURFACE_CARD } from "@/components/ui/surfaces";
import { useAttendanceReminder } from "./useAttendanceReminder";

// v2 상단바 우측 설정 메뉴 — 광장(게시판/우편함/거래소/랭킹/전체 소식) + 게임 안내서 +
// 환경 설정 + 로그아웃. 옛 광장 탭은 모바일에서 탭바 밖으로 밀려 안 보여
// 이 메뉴로 통째 이관(사용자 결정 2026-06-13) — /plaza/* 라우트는 그대로.
// 화면 모드·정책·회원 탈퇴는 /settings/preferences 한곳에서 관리한다.
export function V2SettingsMenu() {
  const [open, setOpen] = useState(false);
  const [coinShopAccessible, setCoinShopAccessible] = useState(
    process.env.NEXT_PUBLIC_MUSEUN_COIN_SHOP_OPEN === "true",
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const attendancePending = useAttendanceReminder();

  useEffect(() => {
    if (coinShopAccessible) return;
    const controller = new AbortController();
    void fetch("/api/v2/museun-coin-shop/access", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => {
        if (response.ok) setCoinShopAccessible(true);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [coinShopAccessible]);

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

  const handleSignOut = () => {
    setOpen(false);
    signOut({ redirectTo: "/sign-in" });
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        // 광장+설정이 함께 들어있어 "설정"으로만 오인되던 톱니 → 햄버거 "메뉴"로(사용자 피드백).
        aria-label={attendancePending ? "메뉴, 오늘 출석 체크 필요" : "메뉴"}
        title={attendancePending ? "메뉴 · 오늘 출석 체크 필요" : "메뉴"}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        <List size={20} weight="bold" />
        {attendancePending && (
          <span
            aria-hidden
            className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white dark:ring-zinc-900"
          />
        )}
      </button>
      {open && (
        <div
          className={`${SURFACE_CARD} ui-dropdown-reveal no-scrollbar absolute right-0 top-full z-[70] mt-2 max-h-[calc(100dvh-4.5rem)] w-[min(12rem,calc(100vw-2rem))] origin-top-right overflow-x-hidden overflow-y-auto overscroll-contain shadow-lg`}
        >
          <ul className="py-1">
            {(
              [
                { href: "/plaza/bulletin", label: "게시판", Icon: ChatsCircle },
                { href: "/plaza/inbox", label: "우편함", Icon: EnvelopeSimple },
                { href: "/plaza/market", label: "거래소", Icon: Storefront },
                { href: "/plaza/rankings", label: "랭킹", Icon: ChartBar },
                { href: "/plaza/feed", label: "전체 소식", Icon: Megaphone },
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
                <span className="flex-1">이벤트</span>
                {attendancePending && (
                  <>
                    <span
                      aria-hidden
                      className="h-2.5 w-2.5 shrink-0 rounded-full bg-rose-500"
                    />
                    <span className="sr-only">오늘 출석 체크 필요</span>
                  </>
                )}
              </Link>
            </li>
            {coinShopAccessible && (
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
          </ul>
          <ul className="border-t border-zinc-200 py-1 dark:border-zinc-700">
            <li>
              <Link
                href="/settings/preferences"
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-zinc-800 transition-colors hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                <GearSix size={18} weight="duotone" />
                환경 설정
              </Link>
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
          </ul>
        </div>
      )}
    </div>
  );
}
