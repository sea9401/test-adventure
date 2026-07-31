"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { ChatButton } from "@/components/ChatButton";
import { NotificationBell } from "./NotificationBell";
import { V2SettingsMenu } from "./V2SettingsMenu";

// v2 메인 화면 타이틀 줄.
// 좌측: 게임 아이콘 — 클릭 시 모험 탭(/)으로 이동.
// 우측: 통합 알림(일반 알림+우편) 미리보기·채팅·광장/설정 메뉴.

export function V2TopBar({
  gameName,
  playerName,
  playerLevel,
  bankedGold,
  coreLoopOn,
  viewerGuildId,
}: {
  gameName: string | null;
  playerName: string;
  playerLevel: number;
  bankedGold: number;
  viewerGuildId: number | null;
  // 코어루프 on 이면 좌상단 은행 금액 대신 캐릭터 이름·레벨을 표기.
  coreLoopOn: boolean;
}) {
  const router = useRouter();
  return (
    <header className="sticky top-0 z-[60] flex items-center justify-between gap-3 border-b border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur sm:px-6 dark:border-zinc-700 dark:bg-zinc-900/90">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={() => router.push("/")}
          aria-label="무슨무슨게임 모험 탭으로 이동"
          className="-mx-1 flex min-w-0 items-center gap-2 rounded-md px-1 py-0.5 transition hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          <Image
            src="/icon-192.png"
            alt=""
            width={28}
            height={28}
            className="size-7 shrink-0 rounded-md"
          />
          {coreLoopOn ? (
            <span className="hidden shrink-0 text-[11px] tabular-nums text-zinc-500 sm:inline dark:text-zinc-400">
              {playerName} Lv.{playerLevel}
            </span>
          ) : (
            bankedGold > 0 && (
              <span className="hidden shrink-0 text-[11px] tabular-nums text-zinc-500 sm:inline dark:text-zinc-400">
                은행 {bankedGold.toLocaleString()}G
              </span>
            )
          )}
        </button>
      </div>
      <nav className="relative z-[61] flex shrink-0 items-center gap-1">
        <NotificationBell />
        {/* 전역 채팅 — 서버가 이름/칭호를 권위 해석(클라 name 은 본인 화면용).
            v2 는 인벤토리 미연결이라 아이템 링크 없이 텍스트 채팅만. */}
        <ChatButton
          name={playerName}
          className=""
          title={null}
          viewerGuildId={viewerGuildId}
        />
        <V2SettingsMenu gameName={gameName} />
      </nav>
    </header>
  );
}
