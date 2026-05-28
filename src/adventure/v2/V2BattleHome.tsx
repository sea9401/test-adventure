"use client";

import { CompassRose, Sword, Trophy } from "@phosphor-icons/react";
import { EntryCard } from "@/components/ui/EntryCard";

// 전투 탭 default — town/character 탭 패턴: EntryCard 던전/지도/아레나 진입.
// 던전 → V2DungeonList (8 층 list). 지도 → V2ContinentMap. 아레나 → V2ArenaView.

export type BattleAction =
  | { kind: "open-dungeons" }
  | { kind: "open-map" }
  | { kind: "open-arena" };

export function V2BattleHome({
  onAction,
}: {
  onAction: (action: BattleAction) => void;
}) {
  return (
    <main className="mx-auto max-w-2xl space-y-3 p-6 text-zinc-900 dark:text-zinc-100">
      <header>
        <h1 className="text-lg font-bold">전투</h1>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          모험가가 향할 사냥터.
        </p>
      </header>
      <div className="space-y-2">
        <EntryCard
          icon={
            <Sword size={28} weight="duotone" className="text-rose-500" />
          }
          title="던전"
          description="현재 거점의 8 층 던전. 층을 선택해 입장."
          onClick={() => onAction({ kind: "open-dungeons" })}
        />
        <EntryCard
          icon={
            <CompassRose
              size={28}
              weight="duotone"
              className="text-emerald-500"
            />
          }
          title="지도"
          description="대륙 지도. 거점 정보 확인 + 다른 거점으로 이동."
          onClick={() => onAction({ kind: "open-map" })}
        />
        <EntryCard
          icon={
            <Trophy size={28} weight="duotone" className="text-amber-500" />
          }
          title="아레나"
          description="1:1 단판 결투 — 빌드 자랑의 무대."
          onClick={() => onAction({ kind: "open-arena" })}
        />
      </div>
    </main>
  );
}
