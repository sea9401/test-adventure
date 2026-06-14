"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { V2TopBar } from "@/adventure/v2/V2TopBar";
import { StaminaBar } from "@/adventure/v2/StaminaBar";
import { WarTicker } from "@/adventure/v2/WarTicker";
import { TabBar } from "@/components/ui/TabBar";
import { useGameState } from "@/adventure/v2/GameStateProvider";
import { OUTPOST_TYPE_BY_ID } from "@/adventure/data/v2/outposts";
import type { OutpostType } from "@/adventure/data/v2/types";

// v2 게임 chrome — 모든 라우트가 공유하는 영속 틀(상단바·탭바·배경·스태미나).
// (game)/layout.tsx 안에 마운트되어 네비게이션마다 remount 되지 않는다 → 자식 page 만 교체.

type TabId = "adventure" | "battle" | "town" | "character" | "guild" | "plaza";

// 광장은 탭에서 제외(모바일에서 6번째 탭이 화면 밖으로 밀려 안 보임) — 기능은 상단
// 설정 메뉴의 "광장" 섹션으로 이관(#723). /plaza/* 라우트·배경 매핑은 그대로 유지.
const TABS: { key: TabId; label: string }[] = [
  { key: "adventure", label: "모험" },
  { key: "battle", label: "전투" },
  { key: "town", label: "마을" },
  { key: "character", label: "캐릭터" },
  { key: "guild", label: "길드" },
];

// 배경을 깔 탭 — 모험/마을/캐릭터. 전투·길드·광장은 별도 이미지 없음(중립 배경).
const BG_TABS = new Set<TabId>(["adventure", "town", "character"]);

// 현재 경로 → 활성 탭. map/outpost 는 마을 탭으로 묶는다(지도=이동 동선, 2026-06-11 이관).
function tabOfPath(pathname: string): TabId {
  if (pathname === "/") return "adventure";
  if (pathname.startsWith("/battle")) return "battle";
  if (
    pathname.startsWith("/town") ||
    pathname.startsWith("/map") ||
    pathname.startsWith("/outpost")
  )
    return "town";
  if (pathname.startsWith("/character")) return "character";
  if (pathname.startsWith("/guild")) return "guild";
  if (pathname.startsWith("/plaza")) return "plaza";
  return "adventure";
}

function hrefOfTab(tab: TabId): string {
  return tab === "adventure" ? "/" : `/${tab}`;
}

// 탭 배경 이미지 — fixed full-screen + 위에 반투명 dim 오버레이.
// 거점 배경은 ui/{type}.webp 를 템플릿 경로로 쓰고(check-images 누락 검사 제외, 없으면
// 404 시 fallbackSrc=village 로 교체), 길드 배경은 ui/guild.webp 정적 경로.
// src 가 바뀌면 부모가 key 로 remount → errored 리셋.
function TabBackground({
  src,
  fallbackSrc,
}: {
  src: string;
  fallbackSrc?: string;
}) {
  const [errored, setErrored] = useState(false);
  const finalSrc = errored && fallbackSrc ? fallbackSrc : src;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={finalSrc}
        alt=""
        onError={() => {
          if (fallbackSrc) setErrored(true);
        }}
        className="h-full w-full object-cover"
      />
      {/* dim 오버레이 — 라이트는 덜 가려 배경 이미지가 더 보이게(/85→/65), 다크는 유지(/80). */}
      <div className="absolute inset-0 bg-zinc-50/65 dark:bg-zinc-950/80" />
    </div>
  );
}

export function GameChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const {
    currentOutpost,
    accountName,
    stamina,
    staminaMax,
    viewerName,
    bankedGold,
  } = useGameState();

  const activeTab = tabOfPath(pathname);
  // 현 위치 거점의 종류 — 배경 이미지 선택용. 거점 밖이면 village 로 취급.
  const currentOutpostType: OutpostType = currentOutpost
    ? (OUTPOST_TYPE_BY_ID.get(currentOutpost.id) ?? "village")
    : "village";
  // 스태미나 바 — 모험/전투 탭만 (지도/거점은 마을 탭 귀속이라 자연 제외).
  const showStamina = activeTab === "adventure" || activeTab === "battle";

  // 탭/화면별 배경 이미지 — 우선순위: 특정 화면(치료소·상점·대장간·낚시터·사냥터·아레나)
  // > 거점 탭(모험/마을/캐릭터) > 길드 > 광장 > 전투 탭. 거점 탭은 현 위치 거점 종류별
  // 이미지(없으면 village 폴백), 나머지는 정적.
  // 낚시터 = 미니게임 + 대회/상점(/town/fishing 하위). 사냥터 = 던전 목록 + 층 전투(/battle/dungeon 하위).
  // 상점/대장간은 마을 탭이지만 전용 배경으로 더 구체 매핑, 아레나도 battle 홈과 구분.
  const background: { src: string; fallbackSrc?: string } | null =
    pathname === "/town/healing"
      ? { src: "/images/ui/healingcenter.webp" }
      : pathname.startsWith("/town/shop")
        ? { src: "/images/ui/shop.webp" }
        : pathname.startsWith("/town/smithy")
          ? { src: "/images/ui/forge.webp" }
          : pathname.startsWith("/town/fishing")
            ? { src: "/images/ui/fishing.webp" }
            : pathname.startsWith("/battle/arena")
              ? { src: "/images/ui/arena.webp" }
              : pathname.startsWith("/battle/dungeon")
                ? { src: "/images/ui/hunt.webp" }
                : BG_TABS.has(activeTab)
                  ? {
                      src: `/images/ui/${currentOutpostType}.webp`,
                      fallbackSrc: "/images/ui/village.webp",
                    }
                  : activeTab === "guild"
                    ? { src: "/images/ui/guild.webp" }
                    : activeTab === "plaza"
                      ? { src: "/images/ui/townhall.webp" }
                      : activeTab === "battle"
                        ? { src: "/images/ui/battle.webp" }
                        : null;

  return (
    <div>
      <V2TopBar
        currentOutpost={currentOutpost}
        gameName={accountName}
        playerName={viewerName}
        bankedGold={bankedGold}
      />
      {background && (
        <TabBackground
          key={background.src}
          src={background.src}
          fallbackSrc={background.fallbackSrc}
        />
      )}
      <div>
        <TabBar
          tabs={TABS}
          active={activeTab}
          onChange={(t) => router.push(hrefOfTab(t))}
          ariaLabel="메인 탭"
          size="lg"
          variant="highlight"
          scrollable
          className="mx-auto w-full max-w-[720px] px-4 sm:px-6 [&_button]:text-[1.0625rem]"
        />
        {/* 전쟁 전광판 — 탭바 바로 아래 전역 한 줄. 사건 0건이면 스스로 숨는다. */}
        <WarTicker />
        {showStamina && (
          <div className="mx-auto w-full max-w-[720px] space-y-2 px-4 py-2 sm:px-6">
            <StaminaBar state={stamina} max={staminaMax} />
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
