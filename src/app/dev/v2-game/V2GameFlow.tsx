"use client";

import { useCallback, useEffect, useState } from "react";
import { ContinentMap } from "@/adventure/v2/ContinentMap";
import { OutpostView } from "@/adventure/v2/OutpostView";
import { ResourceBar } from "@/adventure/v2/ResourceBar";
import { LineupCard } from "@/adventure/v2/LineupCard";
import { DungeonHunt } from "@/app/dev/dungeon-hunt/DungeonHunt";
import type { Outpost } from "@/adventure/data/v2/types";
import type { V2Resources } from "@/adventure/data/v2/resources";

// v2 게임 흐름 dev preview — 단일 페이지에서 view 전환.
// 대륙 맵 → 거점 hub → 던전 사냥 (라이브 TownScreen 패턴 모방).
// occupations + viewer 한 번 fetch 해서 자식 컴포넌트들에 share.

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
  | { kind: "map" }
  | { kind: "outpost"; outpost: Outpost }
  | { kind: "dungeon"; outpost: Outpost };

export function V2GameFlow() {
  const [view, setView] = useState<View>({ kind: "map" });
  const [occupations, setOccupations] = useState<Occupation[]>([]);
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const [resources, setResources] = useState<V2Resources | null>(null);

  const refreshOccupations = useCallback(async () => {
    try {
      const res = await fetch("/api/v2/outpost/occupations");
      if (res.ok) {
        const json = (await res.json()) as { occupations: Occupation[] };
        setOccupations(json.occupations);
      }
    } catch {}
  }, []);

  const refreshResources = useCallback(async () => {
    try {
      const res = await fetch("/api/v2/me/resources");
      if (res.ok) {
        const json = (await res.json()) as {
          resources?: V2Resources;
        };
        if (json.resources) setResources(json.resources);
      }
    } catch {}
  }, []);

  useEffect(() => {
    refreshOccupations();
    refreshResources();
    (async () => {
      try {
        const res = await fetch("/api/auth/session");
        if (res.ok) {
          const j = (await res.json()) as { user?: { id?: string } } | null;
          if (j?.user?.id) setViewerUserId(j.user.id);
        }
      } catch {}
    })();
    // v2 자동 1인 길드 보장 — 첫 진입 시 1회 fire-and-forget. idempotent.
    // guildId 사용은 후속 PR (claim 길드화 + 토너먼트). 지금은 인프라만.
    (async () => {
      try {
        await fetch("/api/v2/me/guild", { method: "POST" });
      } catch {}
    })();
  }, [refreshOccupations, refreshResources]);

  const handleOutpostAction = (action: {
    kind: "back" | "enter-dungeon" | "claimed" | "harvested";
  }) => {
    if (action.kind === "back") setView({ kind: "map" });
    if (action.kind === "enter-dungeon" && view.kind === "outpost")
      setView({ kind: "dungeon", outpost: view.outpost });
    if (action.kind === "claimed") {
      refreshOccupations();
      refreshResources();
    }
    if (action.kind === "harvested") {
      refreshOccupations();
      refreshResources();
    }
  };

  return (
    <div>
      <ResourceBar resources={resources} />
      <LineupCard />
      {view.kind === "outpost" && (
        <OutpostView
          outpost={view.outpost}
          viewerUserId={viewerUserId}
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
          <DungeonHunt outpostId={view.outpost.id} />
        </div>
      )}
      {view.kind === "map" && (
        <ContinentMap
          onOutpostEnter={(o) => setView({ kind: "outpost", outpost: o })}
          occupations={occupations}
          viewerUserId={viewerUserId}
        />
      )}
    </div>
  );
}
