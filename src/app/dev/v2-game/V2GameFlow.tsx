"use client";

import { useCallback, useEffect, useState } from "react";
import { ContinentMap } from "@/adventure/v2/ContinentMap";
import { OutpostView } from "@/adventure/v2/OutpostView";
import { V2CharacterScreen } from "@/adventure/v2/V2CharacterScreen";
import { V2InventoryView } from "@/adventure/v2/V2InventoryView";
import { V2SkillsView } from "@/adventure/v2/V2SkillsView";
import { V2GrowthShrineView } from "@/adventure/v2/V2GrowthShrineView";
import { V2EquipmentView } from "@/adventure/v2/V2EquipmentView";
import { V2TopBar } from "@/adventure/v2/V2TopBar";
import { V2TabBar, type TabId } from "@/adventure/v2/V2TabBar";
import { V2TownHome, type TownAction } from "@/adventure/v2/V2TownHome";
import { V2AdventureHome } from "@/adventure/v2/V2AdventureHome";
import { DungeonHunt } from "@/app/dev/dungeon-hunt/DungeonHunt";
import type { Outpost } from "@/adventure/data/v2/types";
import type { Gender } from "@/adventure/profile/avatars";

// v2 게임 흐름 — 4탭(모험·마을·캐릭터·지도) 기반 nav.
// 캐릭터 탭: 내정보(default)/인벤토리/스킬/장비
// 마을 탭: 마을 home(default)/성장의 신전
// 지도 탭: ContinentMap(default)/outpost/dungeon
// 모험 탭: placeholder

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
  // 캐릭터 탭
  | { kind: "character" }
  | { kind: "inventory" }
  | { kind: "skills" }
  | { kind: "equipment" }
  // 마을 탭
  | { kind: "town" }
  | { kind: "shrine" }
  // 지도 탭
  | { kind: "map" }
  | { kind: "outpost"; outpost: Outpost }
  | { kind: "dungeon"; outpost: Outpost }
  // 모험 탭
  | { kind: "adventure" };

function tabOfView(view: View): TabId {
  switch (view.kind) {
    case "character":
    case "inventory":
    case "skills":
    case "equipment":
      return "character";
    case "town":
    case "shrine":
      return "town";
    case "map":
    case "outpost":
    case "dungeon":
      return "map";
    case "adventure":
      return "adventure";
  }
}

function defaultViewOfTab(tab: TabId): View {
  switch (tab) {
    case "adventure":
      return { kind: "adventure" };
    case "town":
      return { kind: "town" };
    case "character":
      return { kind: "character" };
    case "map":
      return { kind: "map" };
  }
}

export function V2GameFlow() {
  // 시작 탭 = 캐릭터 (제일 자주 보는 곳).
  const [view, setView] = useState<View>(() => defaultViewOfTab("character"));
  const [occupations, setOccupations] = useState<Occupation[]>([]);
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const [viewerGuildId, setViewerGuildId] = useState<number | null>(null);
  const [viewerName, setViewerName] = useState<string>("모험가");
  const [viewerGender, setViewerGender] = useState<Gender>("male1");
  const [currentOutpost, setCurrentOutpost] = useState<
    { id: string; name: string } | null
  >(null);

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
            character?: { name?: string; gender?: string };
            currentOutpost?: { id: string; name: string } | null;
          } | null;
          if (j?.character?.name) setViewerName(j.character.name);
          if (j?.character?.gender) setViewerGender(j.character.gender as Gender);
          if (j?.currentOutpost) setCurrentOutpost(j.currentOutpost);
        }
      } catch {}
    })();
  }, [refreshOccupations]);

  // outpost 진입 helper — 로컬 state + 서버 visit POST 백그라운드.
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

  const handleOutpostAction = (action: {
    kind: "back" | "enter-dungeon" | "claimed" | "harvested";
  }) => {
    if (view.kind !== "outpost") return;
    if (action.kind === "back") setView({ kind: "map" });
    if (action.kind === "enter-dungeon") {
      setView({ kind: "dungeon", outpost: view.outpost });
    }
    if (action.kind === "claimed" || action.kind === "harvested") {
      refreshOccupations();
    }
  };

  const currentTab = tabOfView(view);

  return (
    <div>
      <V2TopBar currentOutpost={currentOutpost} />
      <V2TabBar current={currentTab} onSelect={handleTabSelect} />

      {/* === 캐릭터 탭 === */}
      {view.kind === "character" && (
        <V2CharacterScreen
          onOpenEquipment={() => setView({ kind: "equipment" })}
          onOpenInventory={() => setView({ kind: "inventory" })}
          onOpenSkills={() => setView({ kind: "skills" })}
        />
      )}
      {view.kind === "inventory" && (
        <V2InventoryView onBack={() => setView({ kind: "character" })} />
      )}
      {view.kind === "skills" && (
        <V2SkillsView onBack={() => setView({ kind: "character" })} />
      )}
      {view.kind === "equipment" && (
        <V2EquipmentView onBack={() => setView({ kind: "character" })} />
      )}

      {/* === 마을 탭 === */}
      {view.kind === "town" && <V2TownHome onAction={handleTownAction} />}
      {view.kind === "shrine" && (
        <V2GrowthShrineView onBack={() => setView({ kind: "town" })} />
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
      {view.kind === "dungeon" && (
        <div>
          <div className="border-b border-zinc-200 bg-zinc-50 px-6 py-3 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
            <button
              type="button"
              onClick={() =>
                setView({ kind: "outpost", outpost: view.outpost })
              }
              className="hover:text-zinc-900 dark:hover:text-white"
            >
              ← {view.outpost.name} 로 돌아가기
            </button>
          </div>
          <DungeonHunt
            outpostId={view.outpost.id}
            playerName={viewerName}
            playerGender={viewerGender}
          />
        </div>
      )}

      {/* === 모험 탭 === */}
      {view.kind === "adventure" && <V2AdventureHome />}
    </div>
  );
}
