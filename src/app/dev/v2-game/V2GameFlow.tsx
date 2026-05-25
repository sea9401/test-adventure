"use client";

import { useCallback, useEffect, useState } from "react";
import { ContinentMap } from "@/adventure/v2/ContinentMap";
import { OutpostView } from "@/adventure/v2/OutpostView";
import { OutpostListView } from "@/adventure/v2/OutpostListView";
import { LineupCard } from "@/adventure/v2/LineupCard";
import { V2HomeScreen, type HomeAction } from "@/adventure/v2/V2HomeScreen";
import { V2CharacterScreen } from "@/adventure/v2/V2CharacterScreen";
import { V2InventoryView } from "@/adventure/v2/V2InventoryView";
import { V2SkillsView } from "@/adventure/v2/V2SkillsView";
import { V2GrowthShrineView } from "@/adventure/v2/V2GrowthShrineView";
import { V2EquipmentView } from "@/adventure/v2/V2EquipmentView";
import { DungeonHunt } from "@/app/dev/dungeon-hunt/DungeonHunt";
import type { Outpost } from "@/adventure/data/v2/types";
import type { Gender } from "@/adventure/profile/avatars";

// v2 게임 흐름 — home 중심 라우팅 (라이브 TownScreen 패턴).
// home → outpost-list / map / lineup / outpost(상세) → dungeon.

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
  | { kind: "outpost-list" }
  | { kind: "map" }
  | { kind: "lineup" }
  | { kind: "character" }
  | { kind: "inventory" }
  | { kind: "skills" }
  | { kind: "shrine" }
  | { kind: "equipment" }
  | { kind: "outpost"; outpost: Outpost; from: "list" | "map" }
  | { kind: "dungeon"; outpost: Outpost; from: "list" | "map" };

export function V2GameFlow() {
  const [view, setView] = useState<View>({ kind: "home" });
  const [occupations, setOccupations] = useState<Occupation[]>([]);
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const [viewerGuildId, setViewerGuildId] = useState<number | null>(null);
  // viewer 의 캐릭 정보(이름·gender) — ReplayBattleScene 의 PlayerAvatar 에 사용.
  // me/state 응답에서 받아 두고 dungeon hunt 자식에 prop.
  const [viewerName, setViewerName] = useState<string>("모험가");
  const [viewerGender, setViewerGender] = useState<Gender>("male1");

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
    // 캐릭터 이름·gender — BattleScene 의 PlayerAvatar 용. me/state 한 번 fetch.
    (async () => {
      try {
        const res = await fetch("/api/v2/me/state");
        if (res.ok) {
          const j = (await res.json()) as {
            character?: { name?: string; gender?: string };
          } | null;
          if (j?.character?.name) setViewerName(j.character.name);
          if (j?.character?.gender) setViewerGender(j.character.gender as Gender);
        }
      } catch {}
    })();
  }, [refreshOccupations]);

  const handleHome = (action: HomeAction) => {
    if (action.kind === "open-outposts") setView({ kind: "outpost-list" });
    else if (action.kind === "open-map") setView({ kind: "map" });
    else if (action.kind === "open-lineup") setView({ kind: "lineup" });
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
      setView({
        kind: view.from === "list" ? "outpost-list" : "map",
      } as View);
    }
    if (action.kind === "enter-dungeon") {
      setView({ kind: "dungeon", outpost: view.outpost, from: view.from });
    }
    if (action.kind === "claimed" || action.kind === "harvested") {
      refreshOccupations();
    }
  };

  return (
    <div>
      {view.kind === "home" && <V2HomeScreen onAction={handleHome} />}

      {view.kind === "outpost-list" && (
        <OutpostListView
          occupations={occupations}
          viewerGuildId={viewerGuildId}
          onBack={() => setView({ kind: "home" })}
          onSelect={(outpost) =>
            setView({ kind: "outpost", outpost, from: "list" })
          }
        />
      )}

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
            onOutpostEnter={(o) =>
              setView({ kind: "outpost", outpost: o, from: "map" })
            }
            occupations={occupations}
            viewerUserId={viewerUserId}
          />
        </div>
      )}

      {view.kind === "lineup" && (
        <main className="mx-auto max-w-md space-y-3 p-6">
          <button
            type="button"
            onClick={() => setView({ kind: "home" })}
            className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            ← 메인으로
          </button>
          <LineupCard />
        </main>
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
                setView({
                  kind: "outpost",
                  outpost: view.outpost,
                  from: view.from,
                })
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
