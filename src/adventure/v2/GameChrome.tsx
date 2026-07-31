"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { V2TopBar } from "@/adventure/v2/V2TopBar";
import { OfflineSettleCard } from "@/adventure/v2/OfflineSettleCard";
import { StaminaBar } from "@/adventure/v2/StaminaBar";
import { WarTicker } from "@/adventure/v2/WarTicker";
import { MainTabNav } from "@/adventure/v2/MainTabNav";
import { useGameState } from "@/adventure/v2/GameStateProvider";
import { shouldShowStaminaBar } from "@/adventure/v2/staminaBarVisibility";

// v2 게임 chrome — 모든 라우트가 공유하는 영속 틀(상단바·탭바·배경).
// (game)/layout.tsx 안에 마운트되어 네비게이션마다 remount 되지 않는다 → 자식 page 만 교체.

type TabId = "adventure" | "battle" | "town" | "character" | "guild" | "plaza";

// 탭 목록·하위 메뉴는 MainTabNav 가 소유(#723: 광장은 탭 제외·설정 메뉴로 이관, /plaza/* 라우트·배경만 유지).

// 배경을 깔 탭 — 모험/마을/캐릭터. 전투·길드·광장은 별도 이미지 없음(중립 배경).
const BG_TABS = new Set<TabId>(["adventure", "town", "character"]);

// 현재 경로 → 활성 탭.
function tabOfPath(pathname: string): TabId {
  if (pathname === "/") return "adventure";
  if (pathname.startsWith("/battle")) return "battle";
  if (pathname.startsWith("/town")) return "town";
  // 퀘스트(/quests)는 캐릭터 탭의 하위 메뉴 — 캐릭터로 묶어 활성 강조·배경이 안 깨지게.
  if (pathname.startsWith("/character") || pathname.startsWith("/quests"))
    return "character";
  if (pathname.startsWith("/guild")) return "guild";
  if (pathname.startsWith("/plaza")) return "plaza";
  return "adventure";
}

// 탭 배경 이미지 — fixed full-screen + 위에 반투명 dim 오버레이.
// 길드 배경은 ui/guild.webp 정적 경로.
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
      className="game-scene-background pointer-events-none fixed inset-0 -z-10 overflow-hidden"
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
      {/* 라이트는 흰 카드와 분리되는 옅은 회색 바탕으로 눌러 눈부심을 줄인다. */}
      <div className="absolute inset-0 bg-zinc-100/80 dark:bg-zinc-950/80" />
    </div>
  );
}

export function GameChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const {
    accountName,
    stamina,
    staminaMax,
    staminaRegenBonusPct,
    staminaPotions,
    viewerName,
    viewerGuildId,
    viewerLevel,
    bankedGold,
    coreLoopOn,
    huntStaminaMode,
    refreshGameState,
  } = useGameState();
  // 스태미나 포션 사용(모달에서 개수 선택) — 서버 권위 회복 후 전역 상태 갱신.
  const usePotion = async (count: number) => {
    try {
      await fetch("/api/v2/me/use-stamina-potion", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ count }),
      });
    } catch {}
    await refreshGameState();
  };

  const activeTab = tabOfPath(pathname);
  // 스태미나 바 — 스태미나를 직접 사용하는 지정 화면에서만 노출한다.
  const showStamina = shouldShowStaminaBar(pathname);

  // 탭/화면별 배경 이미지 — 우선순위: 특정 화면(치료소·은행·상점·대장간·낚시터·사냥터·숙련의 탑·아레나·대련장)
  // > 거점 탭(모험/마을/캐릭터) > 길드 > 광장 > 전투 탭. 거점 탭은 현 위치 거점 종류별
  // 이미지(없으면 village 폴백), 나머지는 정적.
  // 낚시터 = 미니게임 + 대회/상점(/town/fishing 하위). 사냥터 = 던전 목록 + 층 전투(/battle/dungeon 하위).
  // 상점/대장간은 마을 탭이지만 전용 배경으로 더 구체 매핑, 아레나도 battle 홈과 구분.
  const background: { src: string; fallbackSrc?: string } | null =
    pathname === "/town/healing"
      ? { src: "/images/ui/healingcenter.webp" }
      : pathname === "/town/bank"
        ? { src: "/images/ui/bank.webp" }
        : pathname.startsWith("/town/shop")
          ? { src: "/images/ui/shop.webp" }
          : pathname.startsWith("/town/smithy")
          ? { src: "/images/ui/forge.webp" }
          : pathname.startsWith("/town/logging")
            ? { src: "/images/ui/forest.webp" }
            : pathname.startsWith("/town/mining")
              ? { src: "/images/ui/quarry.webp" }
              : pathname.startsWith("/town/farm")
                ? { src: "/images/ui/farm.webp" }
                : pathname.startsWith("/town/fishing")
                  ? { src: "/images/ui/fishing.webp" }
                  : pathname.startsWith("/battle/mastery-tower")
                    ? { src: "/images/ui/masterytower.webp" }
                    : pathname.startsWith("/battle/sparring")
                      ? { src: "/images/monster/scarecrow.webp" }
                      : pathname.startsWith("/battle/arena")
                        ? { src: "/images/ui/arena.webp" }
                        : pathname.startsWith("/battle/dungeon")
                          ? { src: "/images/ui/hunt.webp" }
                          : BG_TABS.has(activeTab)
                            ? { src: "/images/ui/village.webp" }
                            : activeTab === "guild"
                              ? { src: "/images/ui/guild.webp" }
                              : activeTab === "plaza"
                                ? { src: "/images/ui/townhall.webp" }
                                : activeTab === "battle"
                                  ? { src: "/images/ui/battle.webp" }
                                  : null;

  return (
    <div className="game-desktop-compact">
      <V2TopBar
        gameName={accountName}
        playerName={viewerName}
        playerLevel={viewerLevel}
        bankedGold={bankedGold}
        coreLoopOn={coreLoopOn}
        viewerGuildId={viewerGuildId}
      />
      {/* 코어루프 오프라인 정산 카드 — flag off 면 offlinePending null 이라 no-op. */}
      <OfflineSettleCard />
      {background && (
        <TabBackground
          key={background.src}
          src={background.src}
          fallbackSrc={background.fallbackSrc}
        />
      )}
      <div>
        {/* 메인 내비 — 5탭 유지, 하위 화면은 드롭다운으로 진입. */}
        <MainTabNav
          activeKey={activeTab}
          viewerGuildId={viewerGuildId}
          onNavigate={(href) => router.push(href)}
        />
        {/* 전쟁 전광판 — 탭바 바로 아래 전역 한 줄. 사건 0건이면 스스로 숨는다. */}
        <WarTicker />
        {/* 쿨다운 모드만 스태미나 폐지(전투 쿨다운 대체) → 바 숨김. 스태미나 모드/off 면 표시. */}
        {showStamina && (!coreLoopOn || huntStaminaMode) && (
          <div className="mx-auto w-full max-w-[720px] space-y-2 px-4 py-2 sm:px-6">
            <StaminaBar
              state={stamina}
              max={staminaMax}
              regenBonusPct={staminaRegenBonusPct}
              potions={staminaPotions}
              onUsePotion={usePotion}
            />
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
