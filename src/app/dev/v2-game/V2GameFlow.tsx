"use client";

import { useState } from "react";
import { ContinentMap } from "@/adventure/v2/ContinentMap";
import { OutpostView } from "@/adventure/v2/OutpostView";
import { DungeonHunt } from "@/app/dev/dungeon-hunt/DungeonHunt";
import type { Outpost } from "@/adventure/data/v2/types";

// v2 게임 흐름 dev preview — 단일 페이지에서 view 전환.
// 대륙 맵 → 거점 hub → 던전 사냥 (라이브 TownScreen 패턴 모방).
//
// 라이브 화면과 본격 통합은 후속 PR — 이건 v2 흐름 자체 검증.

type View =
  | { kind: "map" }
  | { kind: "outpost"; outpost: Outpost }
  | { kind: "dungeon"; outpost: Outpost };

export function V2GameFlow() {
  const [view, setView] = useState<View>({ kind: "map" });

  if (view.kind === "outpost") {
    return (
      <OutpostView
        outpost={view.outpost}
        onAction={(action) => {
          if (action.kind === "back") setView({ kind: "map" });
          if (action.kind === "enter-dungeon")
            setView({ kind: "dungeon", outpost: view.outpost });
        }}
      />
    );
  }

  if (view.kind === "dungeon") {
    return (
      <div>
        <div className="border-b border-zinc-200 bg-zinc-50 px-6 py-3 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
          <button
            type="button"
            onClick={() => setView({ kind: "outpost", outpost: view.outpost })}
            className="hover:text-zinc-900 dark:hover:text-white"
          >
            ← {view.outpost.name} 로 돌아가기
          </button>
        </div>
        <DungeonHunt />
      </div>
    );
  }

  return (
    <div>
      <ContinentMap onOutpostEnter={(o) => setView({ kind: "outpost", outpost: o })} />
    </div>
  );
}
