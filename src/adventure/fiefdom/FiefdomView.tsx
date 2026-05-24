"use client";

import { useState } from "react";
import { useGame } from "@/adventure/GameContext";
import { StarlightTerritoryMap } from "./StarlightTerritoryMap";
import { VillageBuilder } from "./VillageBuilder";
import { useBuilderState } from "./useBuilderState";

// 영지 진입 화면 — Phase 2: 별자리 맵이 1차 진입, 내 별 클릭 시 빌더 진입.
// 상태(useBuilderState)는 여기서 한 번 만들어서 맵/빌더 둘 다에 prop 으로 내려줌.
type View = "map" | "village";

export function FiefdomView() {
  const { back } = useGame();
  const api = useBuilderState();
  const [view, setView] = useState<View>("map");

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 px-1">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          {view === "map" ? "별빛 권역 · 영지 지도" : "영주의 회관"}
        </h2>
        <div className="flex gap-2">
          {view === "village" && (
            <button
              type="button"
              onClick={() => setView("map")}
              className="rounded-md border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 transition-colors hover:bg-indigo-100 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-200 dark:hover:bg-indigo-950"
            >
              ✨ 지도
            </button>
          )}
          <button
            type="button"
            onClick={back}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            뒤로
          </button>
        </div>
      </div>
      {view === "map" ? (
        <StarlightTerritoryMap api={api} onEnterVillage={() => setView("village")} />
      ) : (
        <VillageBuilder api={api} />
      )}
    </div>
  );
}
