"use client";

import { MapPin } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { ChatButton } from "@/components/ChatButton";
import { NotificationBell } from "./NotificationBell";
import { V2SettingsMenu } from "./V2SettingsMenu";

// v2 메인 화면 타이틀 줄.
// 좌측: 현재 거점 위치 (없으면 "이동 중") — 클릭 시 모험 탭(/)으로 이동.
// 우측: 알림(미읽음 뱃지 → /notifications)·채팅·설정.

export function V2TopBar({
  currentOutpost,
  gameName,
  playerName,
  bankedGold,
  atRiskGold,
}: {
  currentOutpost: { id: string; name: string } | null;
  gameName: string | null;
  playerName: string;
  bankedGold: number;
  // 코어루프 위험 골드(패배 시 절반 압류 대상). null=flag off, 0=위험 없음 → 미표시.
  atRiskGold: number | null;
}) {
  const router = useRouter();
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur sm:px-6 dark:border-zinc-800 dark:bg-zinc-950/90">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={() => router.push("/")}
          aria-label="모험 탭으로 이동"
          className="-mx-1 flex min-w-0 items-center gap-2 rounded-md px-1 py-0.5 transition hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          <MapPin
            size={16}
            weight="fill"
            className="shrink-0 text-emerald-500"
          />
          <span className="truncate text-base font-semibold text-zinc-700 dark:text-zinc-200">
            {currentOutpost?.name ?? "이동 중"}
          </span>
          {bankedGold > 0 && (
            <span className="hidden shrink-0 text-[11px] tabular-nums text-zinc-500 sm:inline dark:text-zinc-400">
              은행 {bankedGold.toLocaleString()}G
            </span>
          )}
        </button>
        {/* 위험 골드 — 클릭 시 거점 이동이 일어나지 않게 위치 버튼 밖의 비대화형 칩으로. */}
        {atRiskGold != null && atRiskGold > 0 && (
          <span
            title="패배하면 절반을 세금으로 빼앗깁니다. 은행에 입금하면 안전합니다."
            className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200"
          >
            위험 골드 {atRiskGold.toLocaleString()}G
          </span>
        )}
      </div>
      <nav className="flex shrink-0 items-center gap-1">
        <NotificationBell />
        {/* 전역 채팅 — 서버가 이름/칭호를 권위 해석(클라 name 은 본인 화면용).
            v2 는 인벤토리 미연결이라 아이템 링크 없이 텍스트 채팅만. */}
        <ChatButton name={playerName} className="" title={null} />
        <V2SettingsMenu gameName={gameName} />
      </nav>
    </header>
  );
}
