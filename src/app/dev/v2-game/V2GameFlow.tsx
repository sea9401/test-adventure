"use client";

import { useCallback, useEffect, useState } from "react";
import { ContinentMap } from "@/adventure/v2/ContinentMap";
import { OutpostView } from "@/adventure/v2/OutpostView";
// OutpostListView / LineupCard 는 길드 탭 신규 PR 에서 재활용 예정 — 파일은 보존, 여기 import 만 제거.
import { V2HomeScreen, type HomeAction } from "@/adventure/v2/V2HomeScreen";
import { V2CharacterScreen } from "@/adventure/v2/V2CharacterScreen";
import { V2InventoryView } from "@/adventure/v2/V2InventoryView";
import { V2SkillsView } from "@/adventure/v2/V2SkillsView";
import { V2GrowthShrineView } from "@/adventure/v2/V2GrowthShrineView";
import { V2EquipmentView } from "@/adventure/v2/V2EquipmentView";
import { V2TopBar } from "@/adventure/v2/V2TopBar";
import { DungeonHunt } from "@/app/dev/dungeon-hunt/DungeonHunt";
import type { Outpost } from "@/adventure/data/v2/types";
import type { Gender } from "@/adventure/profile/avatars";

// v2 게임 흐름 — home 중심 라우팅 (라이브 TownScreen 패턴).
// home → map → outpost(상세) → dungeon.
// 거점 목록/라인업은 길드 탭 신규 PR 에서 재배치 예정.

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
  | { kind: "home" }
  | { kind: "map" }
  | { kind: "character" }
  | { kind: "inventory" }
  | { kind: "skills" }
  | { kind: "shrine" }
  | { kind: "equipment" }
  | { kind: "outpost"; outpost: Outpost }
  | { kind: "dungeon"; outpost: Outpost };

export function V2GameFlow() {
  const [view, setView] = useState<View>({ kind: "home" });
  const [occupations, setOccupations] = useState<Occupation[]>([]);
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const [viewerGuildId, setViewerGuildId] = useState<number | null>(null);
  // viewer 의 캐릭 정보(이름·gender) — ReplayBattleScene 의 PlayerAvatar 에 사용.
  // me/state 응답에서 받아 두고 dungeon hunt 자식에 prop.
  const [viewerName, setViewerName] = useState<string>("모험가");
  const [viewerGender, setViewerGender] = useState<Gender>("male1");
  // V2TopBar 좌측 표시 — outpost 진입 시 visit POST → state 갱신.
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
    // v2 자동 1인 길드 보장 — 첫 진입 시 1회. idempotent.
    // guildId 는 정책 게이트(거점 입장 가능 여부 판정)에 사용.
    (async () => {
      try {
        const res = await fetch("/api/v2/me/guild", { method: "POST" });
        if (res.ok) {
          const j = (await res.json()) as { guildId?: number } | null;
          if (typeof j?.guildId === "number") setViewerGuildId(j.guildId);
        }
      } catch {}
    })();
    // 캐릭터 이름·gender + currentOutpost — V2TopBar 좌측, BattleScene 의 PlayerAvatar 용.
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

  // outpost 진입 helper — 로컬 state 즉시 갱신 + 서버 visit POST 백그라운드.
  const enterOutpost = useCallback((outpost: Outpost) => {
    setCurrentOutpost({ id: outpost.id, name: outpost.name });
    setView({ kind: "outpost", outpost });
    void fetch("/api/v2/me/visit-outpost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ outpostId: outpost.id }),
    }).catch(() => {});
  }, []);

  const handleHome = (action: HomeAction) => {
    if (action.kind === "open-map") setView({ kind: "map" });
    else if (action.kind === "open-character") setView({ kind: "character" });
    else if (action.kind === "open-inventory") setView({ kind: "inventory" });
    else if (action.kind === "open-skills") setView({ kind: "skills" });
    else if (action.kind === "open-shrine") setView({ kind: "shrine" });
    else if (action.kind === "open-equipment") setView({ kind: "equipment" });
  };

  const handleOutpostAction = (action: {
    kind: "back" | "enter-dungeon" | "claimed" | "harvested";
  }) => {
    if (view.kind !== "outpost") return;
    if (action.kind === "back") {
      setView({ kind: "map" });
    }
    if (action.kind === "enter-dungeon") {
      setView({ kind: "dungeon", outpost: view.outpost });
    }
    if (action.kind === "claimed" || action.kind === "harvested") {
      refreshOccupations();
    }
  };

  return (
    <div>
      <V2TopBar currentOutpost={currentOutpost} />
      {view.kind === "home" && <V2HomeScreen onAction={handleHome} />}

      {view.kind === "map" && (
        <div>
          <div className="border-b border-zinc-200 bg-zinc-50 px-6 py-3 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
            <button
              type="button"
              onClick={() => setView({ kind: "home" })}
              className="hover:text-zinc-900 dark:hover:text-white"
            >
              ← 메인으로
            </button>
          </div>
          <ContinentMap
            onOutpostEnter={enterOutpost}
            occupations={occupations}
            viewerUserId={viewerUserId}
          />
        </div>
      )}

      {view.kind === "character" && (
        <V2CharacterScreen onBack={() => setView({ kind: "home" })} />
      )}

      {view.kind === "inventory" && (
        <V2InventoryView onBack={() => setView({ kind: "home" })} />
      )}

      {view.kind === "skills" && (
        <V2SkillsView onBack={() => setView({ kind: "home" })} />
      )}

      {view.kind === "shrine" && (
        <V2GrowthShrineView onBack={() => setView({ kind: "home" })} />
      )}

      {view.kind === "equipment" && (
        <V2EquipmentView onBack={() => setView({ kind: "home" })} />
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
    </div>
  );
}
