"use client";

import type { FocusEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChatButton } from "@/components/ChatButton";
import { V2TopBar } from "@/adventure/v2/V2TopBar";
import { OfflineSettleCard } from "@/adventure/v2/OfflineSettleCard";
import { StaminaBar } from "@/adventure/v2/StaminaBar";
import { WarTicker } from "@/adventure/v2/WarTicker";
import { MainTabNav } from "@/adventure/v2/MainTabNav";
import { useGameState } from "@/adventure/v2/GameStateProvider";
import { shouldShowStaminaBar } from "@/adventure/v2/staminaBarVisibility";
import { UgcConsentPrompt } from "@/components/safety/UgcConsentPrompt";
import { GameSceneBackground } from "@/adventure/v2/GameSceneBackground";
import { GameContentTransition } from "@/adventure/v2/GameContentTransition";
import { gameSceneBackgroundForPath } from "@/adventure/v2/gameSceneBackgroundForPath";
import { gameTabForPath, type GameTabId } from "@/adventure/v2/gameTabForPath";
import { SURFACE_GAME_HEADER } from "@/components/ui/surfaces";

// v2 게임 chrome — 모든 라우트가 공유하는 영속 틀(상단바·탭바·배경).
// (game)/layout.tsx 안에 마운트되어 네비게이션마다 remount 되지 않는다 → 자식 page 만 교체.

// 탭 목록·하위 메뉴는 MainTabNav 가 소유(#723: 광장은 탭 제외·설정 메뉴로 이관, /plaza/* 라우트·배경만 유지).

// 배경을 깔 탭 — 모험/마을/캐릭터. 전투·길드·광장은 별도 이미지 없음(중립 배경).
const BG_TABS = new Set<GameTabId>(["adventure", "town", "life", "character"]);

function selectNumericInputValue(event: FocusEvent<HTMLDivElement>) {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  if (input.type !== "number" && input.inputMode !== "numeric") return;
  // 기존 기본값을 먼저 지울 필요 없이 새 숫자로 바로 덮어쓸 수 있게 한다.
  // 일부 브라우저는 type=number 의 select()를 지원하지 않으므로 그대로 입력 가능하게 둔다.
  try {
    input.select();
  } catch {}
}

export function GameChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const {
    stamina,
    staminaMax,
    spendableGold,
    staminaRegenBonusPct,
    staminaPotions,
    viewerName,
    viewerGuildId,
    gameStateLoaded,
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

  const activeTab = gameTabForPath(pathname);
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
                          ? gameSceneBackgroundForPath(pathname)
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
    <div
      className="game-desktop-compact"
      onFocusCapture={selectNumericInputValue}
    >
      <header
        data-game-header
        className={`${SURFACE_GAME_HEADER} sticky top-0 z-[60] pt-[env(safe-area-inset-top)]`}
      >
        <div className="mx-auto w-full max-w-[864px]">
          <V2TopBar
            stamina={stamina}
            staminaMax={staminaMax}
            spendableGold={spendableGold}
          />
          {/* 메인 내비 — 마을 시설과 생활 콘텐츠를 분리한 6탭. */}
          <MainTabNav
            activeKey={activeTab}
            gameStateLoaded={gameStateLoaded}
            viewerGuildId={viewerGuildId}
            onNavigate={(href) => router.push(href)}
          />
          {/* 전쟁 전광판 — 탭바 바로 아래 전역 한 줄. 사건 0건이면 빈 높이를 만들지 않는다. */}
          <div
            data-game-ticker-slot
            className="overflow-hidden"
          >
            <WarTicker />
          </div>
        </div>
      </header>
      <UgcConsentPrompt />
      {/* 전역 채팅 — 메뉴 안에 묻히지 않도록 모든 게임 화면 우하단에 고정한다.
          모바일은 하단 액션 바를 피하고, 단일 인스턴스라 폴링·읽음 상태도 중복되지 않는다. */}
      <ChatButton
        name={viewerName}
        className=""
        title={null}
        viewerGuildId={viewerGuildId}
        variant="floating"
      />
      {/* 코어루프 오프라인 정산 카드 — flag off 면 offlinePending null 이라 no-op. */}
      <OfflineSettleCard />
      {background && (
        <GameSceneBackground
          src={background.src}
          fallbackSrc={background.fallbackSrc}
        />
      )}
      <div>
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
        {/* 모바일에서는 우하단 고정 채팅 버튼 뒤로 마지막 컨트롤이 가려지지 않도록
            버튼 높이·위치와 기기 하단 안전 영역만큼 스크롤 여유를 둔다. */}
        <GameContentTransition>
          <div className="pb-[calc(env(safe-area-inset-bottom)+9rem)] sm:pb-0">
            {children}
          </div>
        </GameContentTransition>
      </div>
    </div>
  );
}
