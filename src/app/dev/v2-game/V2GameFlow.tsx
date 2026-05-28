"use client";

import { useCallback, useEffect, useState } from "react";
import { ContinentMap } from "@/adventure/v2/ContinentMap";
import { OutpostView } from "@/adventure/v2/OutpostView";
import { V2CharacterScreen } from "@/adventure/v2/V2CharacterScreen";
import {
  V2CharacterMenu,
  type CharacterAction,
} from "@/adventure/v2/V2CharacterMenu";
import { V2InventoryView } from "@/adventure/v2/V2InventoryView";
import { V2SkillEquipPanel } from "@/adventure/v2/V2SkillEquipPanel";
import { V2InstructorView } from "@/adventure/v2/V2InstructorView";
import { V2GrowthShrineView } from "@/adventure/v2/V2GrowthShrineView";
import { V2EquipmentView } from "@/adventure/v2/V2EquipmentView";
import { V2GuildHallView } from "@/adventure/v2/V2GuildHallView";
import { V2HealingView } from "@/adventure/v2/V2HealingView";
import { V2PlaceholderView } from "@/adventure/v2/V2PlaceholderView";
import { V2ShopView } from "@/adventure/v2/V2ShopView";
import { V2TopBar } from "@/adventure/v2/V2TopBar";
import { TabBar } from "@/components/ui/TabBar";
import { V2TownHome, type TownAction } from "@/adventure/v2/V2TownHome";
import { V2AdventureHome } from "@/adventure/v2/V2AdventureHome";
import { V2ArenaView } from "@/adventure/v2/V2ArenaView";
import { V2BattleHome, type BattleAction } from "@/adventure/v2/V2BattleHome";
import { V2DungeonList } from "@/adventure/v2/V2DungeonList";
import { V2DungeonFloorView } from "@/adventure/v2/V2DungeonFloorView";
import { V2GuildHome } from "@/adventure/v2/V2GuildHome";
import { StaminaBar } from "@/adventure/v2/StaminaBar";
import { initialStamina, type StaminaState } from "@/adventure/v2/stamina";
import type { DungeonFloorId, Outpost } from "@/adventure/data/v2/types";
import type { Gender } from "@/adventure/profile/avatars";

// v2 게임 흐름 — 5탭(모험·전투·마을·캐릭터·길드) 기반 nav.
// 모험: placeholder
// 전투: sub-tab(던전·지도) — 던전 사냥 + 대륙 지도 + 거점 진입
// 마을: 마을 home(default)/성장의 신전/치료소/상점/훈련장/대장간
// 캐릭터: 메뉴(default)/내정보/인벤토리/스킬/장비 — 내정보 안의 슬롯 클릭으로 장비 진입
// 길드: 길드 home

type TabId = "adventure" | "battle" | "town" | "character" | "guild";

const TABS: { key: TabId; label: string }[] = [
  { key: "adventure", label: "모험" },
  { key: "battle", label: "전투" },
  { key: "town", label: "마을" },
  { key: "character", label: "캐릭터" },
  { key: "guild", label: "길드" },
];

export type Occupation = {
  outpostId: string;
  occupiedByUserId: string | null;
  occupiedByGuildId: number | null;
  occupiedAt: string;
  policy: string;
  taxRate: string;
  nextAttackAt: string;
};

type View =
  | { kind: "adventure" }
  | { kind: "arena" }
  | { kind: "battle" }
  | { kind: "dungeons" }
  | { kind: "battle-floor"; floorId: DungeonFloorId }
  | { kind: "town" }
  | { kind: "shrine" }
  | { kind: "healing" }
  | { kind: "shop" }
  | { kind: "training" }
  | { kind: "smithy" }
  | { kind: "instructors" }
  | { kind: "guild-hall" }
  | { kind: "character" }
  | { kind: "character-info" }
  | { kind: "inventory" }
  | { kind: "skills" }
  | { kind: "equipment" }
  | { kind: "guild" }
  | { kind: "map" }
  | { kind: "outpost"; outpost: Outpost };

function tabOfView(view: View): TabId {
  switch (view.kind) {
    case "adventure":
      return "adventure";
    case "battle":
    case "dungeons":
    case "battle-floor":
    case "map":
    case "outpost":
    case "arena":
      return "battle";
    case "town":
    case "shrine":
    case "healing":
    case "shop":
    case "training":
    case "smithy":
    case "instructors":
    case "guild-hall":
      return "town";
    case "character":
    case "character-info":
    case "inventory":
    case "skills":
    case "equipment":
      return "character";
    case "guild":
      return "guild";
  }
}

function defaultViewOfTab(tab: TabId): View {
  switch (tab) {
    case "adventure":
      return { kind: "adventure" };
    case "battle":
      return { kind: "battle" };
    case "town":
      return { kind: "town" };
    case "character":
      return { kind: "character" };
    case "guild":
      return { kind: "guild" };
  }
}

export function V2GameFlow() {
  // 첫 시작 탭 — adventure (모험). 사용자가 진입 즉시 사냥/거점 흐름으로 안내.
  const [view, setView] = useState<View>(() => defaultViewOfTab("adventure"));
  const [occupations, setOccupations] = useState<Occupation[]>([]);
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const [viewerGuildId, setViewerGuildId] = useState<number | null>(null);
  const [viewerName, setViewerName] = useState<string>("모험가");
  const [viewerGender, setViewerGender] = useState<Gender>("male1");
  const [currentOutpost, setCurrentOutpost] = useState<
    { id: string; name: string } | null
  >(null);
  // 전역 stamina — me/state mount fetch 에서 초기화. 던전 hunt 응답 시 갱신.
  // nav 아래 sticky StaminaBar 가 표시 (모든 탭에서 동일).
  const [stamina, setStamina] = useState<StaminaState>(() =>
    initialStamina(Date.now()),
  );

  const refreshOccupations = useCallback(async () => {
    try {
      const res = await fetch("/api/v2/outpost/occupations");
      if (res.ok) {
        const json = (await res.json()) as { occupations: Occupation[] };
        setOccupations(json.occupations);
      }
    } catch {}
  }, []);

  useEffect(() => {
    refreshOccupations();
    (async () => {
      try {
        const res = await fetch("/api/auth/session");
        if (res.ok) {
          const j = (await res.json()) as { user?: { id?: string } } | null;
          if (j?.user?.id) setViewerUserId(j.user.id);
        }
      } catch {}
    })();
    (async () => {
      try {
        const res = await fetch("/api/v2/me/guild");
        if (res.ok) {
          const j = (await res.json()) as { guildId?: number | null } | null;
          // 무소속이면 null — 상태 그대로 두면 점령/거점 UI 가 적절히 비활성화.
          if (typeof j?.guildId === "number") setViewerGuildId(j.guildId);
        }
      } catch {}
    })();
    (async () => {
      try {
        const res = await fetch("/api/v2/me/state");
        if (res.ok) {
          const j = (await res.json()) as {
            character?: {
              name?: string;
              gender?: string;
              stamina?: { current: number; lastUpdatedAt: number };
            };
            currentOutpost?: { id: string; name: string } | null;
          } | null;
          if (j?.character?.name) setViewerName(j.character.name);
          if (j?.character?.gender) setViewerGender(j.character.gender as Gender);
          if (j?.character?.stamina) {
            setStamina({
              current: j.character.stamina.current,
              lastUpdatedAt: j.character.stamina.lastUpdatedAt,
            });
          }
          if (j?.currentOutpost) setCurrentOutpost(j.currentOutpost);
        }
      } catch {}
    })();
  }, [refreshOccupations]);

  const enterOutpost = useCallback((outpost: Outpost) => {
    setCurrentOutpost({ id: outpost.id, name: outpost.name });
    setView({ kind: "outpost", outpost });
    void fetch("/api/v2/me/visit-outpost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ outpostId: outpost.id }),
    }).catch(() => {});
  }, []);

  const handleTabSelect = (tab: TabId) => {
    setView(defaultViewOfTab(tab));
  };

  const handleTownAction = (action: TownAction) => {
    switch (action.kind) {
      case "open-shrine":
        setView({ kind: "shrine" });
        break;
      case "open-healing":
        setView({ kind: "healing" });
        break;
      case "open-shop":
        setView({ kind: "shop" });
        break;
      case "open-training":
        setView({ kind: "training" });
        break;
      case "open-smithy":
        setView({ kind: "smithy" });
        break;
      case "open-instructors":
        setView({ kind: "instructors" });
        break;
      case "open-guild-hall":
        setView({ kind: "guild-hall" });
        break;
    }
  };

  // OutpostView 의 enter-dungeon 은 폐기 (사용자 의도 — 사냥터를 전투 탭으로 이동).
  // 그 외 action (back/claimed/harvested) 만 처리.
  const handleOutpostAction = (action: {
    kind: "back" | "enter-dungeon" | "claimed" | "harvested";
  }) => {
    if (view.kind !== "outpost") return;
    if (action.kind === "back") setView({ kind: "map" });
    if (action.kind === "claimed" || action.kind === "harvested") {
      refreshOccupations();
    }
  };

  const currentTab = tabOfView(view);

  return (
    <div>
      <V2TopBar currentOutpost={currentOutpost} />
      {/* 모험 탭 배경 — 라이브 RegionBackground 와 동일한 오버레이 강도. */}
      {currentTab === "adventure" && (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/ui/village.webp"
            alt=""
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-zinc-50/85 dark:bg-zinc-950/80" />
        </div>
      )}
      <div>
        <TabBar
          tabs={TABS}
          active={currentTab}
          onChange={handleTabSelect}
          ariaLabel="메인 탭"
          size="sm"
          className="mx-auto w-full max-w-3xl px-4 sm:px-6"
        />
        {(currentTab === "adventure" ||
          (currentTab === "battle" &&
            view.kind !== "map" &&
            view.kind !== "outpost")) && (
          <div className="mx-auto w-full max-w-3xl px-4 py-2 sm:px-6">
            <StaminaBar state={stamina} />
          </div>
        )}

      {/* === 모험 탭 === */}
      {view.kind === "adventure" && (
        <V2AdventureHome
          currentOutpost={currentOutpost}
          onEnterOutpost={enterOutpost}
        />
      )}

      {/* === 전투 탭 === */}
      {view.kind === "battle" && (
        <V2BattleHome
          onAction={(action: BattleAction) => {
            if (action.kind === "open-dungeons") setView({ kind: "dungeons" });
            else if (action.kind === "open-map") setView({ kind: "map" });
            else if (action.kind === "open-arena") setView({ kind: "arena" });
          }}
        />
      )}
      {view.kind === "arena" && (
        <V2ArenaView onBack={() => setView({ kind: "battle" })} />
      )}
      {view.kind === "dungeons" && (
        <V2DungeonList
          currentOutpost={currentOutpost}
          onSelectFloor={(floorId) => setView({ kind: "battle-floor", floorId })}
          onOpenMap={() => setView({ kind: "map" })}
        />
      )}
      {view.kind === "battle-floor" && currentOutpost && (
        <V2DungeonFloorView
          floorId={view.floorId}
          outpostId={currentOutpost.id}
          outpostName={currentOutpost.name}
          playerName={viewerName}
          playerGender={viewerGender}
          stamina={stamina}
          setStamina={setStamina}
          onBack={() => setView({ kind: "dungeons" })}
        />
      )}
      {view.kind === "battle-floor" && !currentOutpost && (
        // 거점이 사라진 사고용 안전 — 자동 dungeons 로 복귀.
        <V2DungeonList
          currentOutpost={null}
          onSelectFloor={() => {}}
          onOpenMap={() => setView({ kind: "map" })}
        />
      )}

      {/* === 마을 탭 === */}
      {view.kind === "town" && <V2TownHome onAction={handleTownAction} />}
      {view.kind === "shrine" && (
        <V2GrowthShrineView onBack={() => setView({ kind: "town" })} />
      )}
      {view.kind === "healing" && (
        <V2HealingView onBack={() => setView({ kind: "town" })} />
      )}
      {view.kind === "shop" && (
        <V2ShopView onBack={() => setView({ kind: "town" })} />
      )}
      {view.kind === "training" && (
        <V2PlaceholderView
          title="훈련장"
          onBack={() => setView({ kind: "town" })}
        />
      )}
      {view.kind === "smithy" && (
        <V2PlaceholderView
          title="대장간"
          onBack={() => setView({ kind: "town" })}
        />
      )}

      {/* === 캐릭터 탭 === */}
      {view.kind === "character" && (
        <V2CharacterMenu
          onAction={(a: CharacterAction) => {
            switch (a.kind) {
              case "open-info":
                setView({ kind: "character-info" });
                break;
              case "open-inventory":
                setView({ kind: "inventory" });
                break;
              case "open-skills":
                setView({ kind: "skills" });
                break;
            }
          }}
        />
      )}
      {view.kind === "character-info" && (
        <V2CharacterScreen
          onOpenEquipment={() => setView({ kind: "equipment" })}
          onBack={() => setView({ kind: "character" })}
        />
      )}
      {view.kind === "inventory" && (
        <V2InventoryView onBack={() => setView({ kind: "character" })} />
      )}
      {view.kind === "skills" && (
        <V2SkillEquipPanel onBack={() => setView({ kind: "character" })} />
      )}
      {view.kind === "instructors" && (
        <V2InstructorView onBack={() => setView({ kind: "town" })} />
      )}
      {view.kind === "guild-hall" && (
        <V2GuildHallView onBack={() => setView({ kind: "town" })} />
      )}
      {view.kind === "equipment" && (
        <V2EquipmentView onBack={() => setView({ kind: "character-info" })} />
      )}

      {/* === 길드 탭 === */}
      {view.kind === "guild" && (
        <V2GuildHome
          viewerGuildId={viewerGuildId}
          viewerUserId={viewerUserId}
          occupations={occupations}
        />
      )}

      {/* === 지도 탭 === */}
      {view.kind === "map" && (
        <ContinentMap
          onOutpostEnter={enterOutpost}
          occupations={occupations}
          viewerUserId={viewerUserId}
        />
      )}
      {view.kind === "outpost" && (
        <OutpostView
          outpost={view.outpost}
          viewerUserId={viewerUserId}
          viewerGuildId={viewerGuildId}
          occupation={
            occupations.find((o) => o.outpostId === view.outpost.id) ?? null
          }
          onAction={handleOutpostAction}
        />
      )}
      </div>
    </div>
  );
}
