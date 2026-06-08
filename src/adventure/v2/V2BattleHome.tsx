"use client";

import { Barbell, CompassRose, Sword, Trophy } from "@phosphor-icons/react";
import { EntryCard } from "@/components/ui/EntryCard";

// 전투 탭 default — town/character 탭 패턴: EntryCard 던전/지도/아레나 진입.
// 던전 → V2DungeonList (8 층 list). 지도 → V2ContinentMap. 아레나 → V2ArenaView.

export type BattleAction =
  | { kind: "open-dungeons" }
  | { kind: "open-map" }
  | { kind: "open-arena" }
  | { kind: "open-sparring" };

export function V2BattleHome({
  onAction,
}: {
  onAction: (action: BattleAction) => void;
}) {
  return (
    <main className="mx-auto max-w-[720px] space-y-3 p-6 text-zinc-900 dark:text-zinc-100">
      <header>
        <h1 className="text-lg font-bold">전투</h1>
      </header>
      <div className="space-y-2">
        <EntryCard
          icon={
            <Sword size={28} weight="duotone" className="text-rose-500" />
          }
          title="사냥터"
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
          onClick={() => onAction({ kind: "open-map" })}
        />
        <EntryCard
          icon={
            <Trophy size={28} weight="duotone" className="text-amber-500" />
          }
          title="아레나"
          onClick={() => onAction({ kind: "open-arena" })}
        />
        <EntryCard
          icon={
            <Barbell size={28} weight="duotone" className="text-sky-500" />
          }
          title="허수아비"
          onClick={() => onAction({ kind: "open-sparring" })}
        />
      </div>
    </main>
  );
}
