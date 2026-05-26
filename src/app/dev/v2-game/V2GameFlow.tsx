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
import { V2SkillsView } from "@/adventure/v2/V2SkillsView";
import { V2GrowthShrineView } from "@/adventure/v2/V2GrowthShrineView";
import { V2EquipmentView } from "@/adventure/v2/V2EquipmentView";
import { V2TopBar } from "@/adventure/v2/V2TopBar";
import { TabBar } from "@/components/ui/TabBar";
import { V2TownHome, type TownAction } from "@/adventure/v2/V2TownHome";
import { V2AdventureHome } from "@/adventure/v2/V2AdventureHome";
import { V2BattleHome } from "@/adventure/v2/V2BattleHome";
import { V2DungeonFloorView } from "@/adventure/v2/V2DungeonFloorView";
import { V2GuildHome } from "@/adventure/v2/V2GuildHome";
import { StaminaBar } from "@/adventure/v2/StaminaBar";
import { initialStamina, type StaminaState } from "@/adventure/v2/stamina";
import type { DungeonFloorId, Outpost } from "@/adventure/data/v2/types";
import type { Gender } from "@/adventure/profile/avatars";

// v2 게임 흐름 — 5탭(모험·전투·마을·캐릭터·지도) 기반 nav.
// 모험: placeholder
// 전투: 현재 거점의 던전 사냥 (currentOutpost 자동)
// 마을: 마을 home(default)/성장의 신전
// 캐릭터: 메뉴(default)/내정보/인벤토리/스킬/장비 — 내정보 안의 슬롯 클릭으로 장비 진입
// 지도: ContinentMap(default)/outpost

type TabId =
  | "adventure"
  | "battle"
  | "town"
  | "character"
  | "guild"
  | "map";

const TABS: { key: TabId; label: string }[] = [
  { key: "adventure", label: "모험" },
  { key: "battle", label: "전투" },
  { key: "town", label: "마을" },
  { key: "character", label: "캐릭터" },
  { key: "guild", label: "길드" },
  { key: "map", label: "지도" },
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
  | { kind: "battle" }
  | { kind: "battle-floor"; floorId: DungeonFloorId }
  | { kind: "town" }
  | { kind: "shrine" }
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
    case "battle-floor":
      return "battle";
    case "town":
    case "shrine":
      return "town";
    case "character":
    case "character-info":
    case "inventory":
    case "skills":
    case "equipment":
      return "character";
    case "guild":
      return "guild";
    case "map":
    case "outpost":
      return "map";
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
    case "map":
      return { kind: "map" };
  }
}

export function V2GameFlow() {
  const [view, setView] = useState<View>(() => defaultViewOfTab("character"));
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
        const res = await fetch("/api/v2/me/guild", { method: "POST" });
        if (res.ok) {
          const j = (await res.json()) as { guildId?: number } | null;
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
    if (action.kind === "open-shrine") setView({ kind: "shrine" });
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
      {/* 탭바 + 스태미너 — main 흐름 안에 일반 배치 (스크롤 같이 움직임). */}
      <div>
        <TabBar
          tabs={TABS}
          active={currentTab}
          onChange={handleTabSelect}
          ariaLabel="메인 탭"
          size="sm"
          className="mx-auto w-full max-w-2xl px-4 sm:px-6"
        />
        {currentTab !== "map" && (
          <div className="mx-auto w-full max-w-2xl px-4 py-2 sm:px-6">
            <StaminaBar state={stamina} />
          </div>
        )}
      </div>

      {/* === 모험 탭 === */}
      {view.kind === "adventure" && <V2AdventureHome />}

      {/* === 전투 탭 === */}
      {view.kind === "battle" && (
        <V2BattleHome
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
          onBack={() => setView({ kind: "battle" })}
        />
      )}
      {view.kind === "battle-floor" && !currentOutpost && (
        // 거점이 사라진 사고용 안전 — 자동 battle 로 복귀.
        <V2BattleHome
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
        <V2SkillsView onBack={() => setView({ kind: "character" })} />
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
  );
}
