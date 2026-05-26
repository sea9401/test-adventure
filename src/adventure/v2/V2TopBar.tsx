"use client";

import {
  Bell,
  ChatCircle,
  Gear,
  MapPin,
} from "@phosphor-icons/react";

// v2 메인 화면 타이틀 줄.
// 좌측: 현재 거점 위치 (없으면 "이동 중") — V2GameFlow 가 visit 시 갱신.
// 우측: 알림·채팅·설정 아이콘 — 일단 모양만, 클릭 시 no-op.

export function V2TopBar({
  currentOutpost,
}: {
  currentOutpost: { id: string; name: string } | null;
}) {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur sm:px-6 dark:border-zinc-800 dark:bg-zinc-950/90">
      <div className="flex min-w-0 items-center gap-2">
        <MapPin size={16} weight="fill" className="shrink-0 text-emerald-500" />
        <span className="truncate text-base font-semibold text-zinc-700 dark:text-zinc-200">
          {currentOutpost?.name ?? "이동 중"}
        </span>
      </div>
      <nav className="flex shrink-0 items-center gap-1">
        <IconButton aria-label="알림">
          <Bell size={18} weight="duotone" />
        </IconButton>
        <IconButton aria-label="채팅">
          <ChatCircle size={18} weight="duotone" />
        </IconButton>
        <IconButton aria-label="설정">
          <Gear size={18} weight="duotone" />
        </IconButton>
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
