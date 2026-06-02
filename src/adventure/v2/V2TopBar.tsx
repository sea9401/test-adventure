"use client";

import { Bell, MapPin } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { ChatButton } from "@/components/ChatButton";
import { V2SettingsMenu } from "./V2SettingsMenu";

// v2 메인 화면 타이틀 줄.
// 좌측: 현재 거점 위치 (없으면 "이동 중") — 클릭 시 모험 탭(/)으로 이동.
// 우측: 알림·채팅·설정. 채팅(ChatButton, 전역 /api/chat)·설정 wiring, 알림은 placeholder.

export function V2TopBar({
  currentOutpost,
  gameName,
  playerName,
}: {
  currentOutpost: { id: string; name: string } | null;
  gameName: string | null;
  playerName: string;
}) {
  const router = useRouter();
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur sm:px-6 dark:border-zinc-800 dark:bg-zinc-950/90">
      <button
        type="button"
        onClick={() => router.push("/")}
        aria-label="모험 탭으로 이동"
        className="-mx-1 flex min-w-0 items-center gap-2 rounded-md px-1 py-0.5 transition hover:bg-zinc-100 dark:hover:bg-zinc-800"
      >
        <MapPin size={16} weight="fill" className="shrink-0 text-emerald-500" />
        <span className="truncate text-base font-semibold text-zinc-700 dark:text-zinc-200">
          {currentOutpost?.name ?? "이동 중"}
        </span>
      </button>
      <nav className="flex shrink-0 items-center gap-1">
        <IconButton aria-label="알림">
          <Bell size={18} weight="duotone" />
        </IconButton>
        {/* 전역 채팅 — 서버가 이름/칭호를 권위 해석(클라 name 은 본인 화면용).
            v2 는 인벤토리 미연결이라 아이템 링크 없이 텍스트 채팅만. */}
        <ChatButton name={playerName} className="" title={null} />
        <V2SettingsMenu gameName={gameName} />
      </nav>
    </header>
  );
}

// no-op 아이콘 버튼 — 클릭 무시. 미래에 onClick prop 추가.
function IconButton({
  children,
  ...rest
}: {
  children: React.ReactNode;
  "aria-label": string;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        /* TODO: 기능 wiring (알림/채팅/설정) */
      }}
      className="rounded p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
      {...rest}
    >
      {children}
    </button>
  );
}
