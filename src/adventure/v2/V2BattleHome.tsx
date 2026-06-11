"use client";

import {
  Barbell,
  CastleTurret,
  Crosshair,
  Sword,
  Trophy,
} from "@phosphor-icons/react";
import { EntryCard } from "@/components/ui/EntryCard";
import { HeaderPanel } from "@/components/ui/HeaderPanel";

// 전투 탭 default — town/character 탭 패턴: EntryCard 사냥터/전황/아레나/허수아비 진입.
// 지도는 마을 탭으로 이관(2026-06-11).

export type BattleAction =
  | { kind: "open-dungeons" }
  | { kind: "open-war" }
  | { kind: "open-subjugation" }
  | { kind: "open-arena" }
  | { kind: "open-sparring" };

export function V2BattleHome({
  onAction,
}: {
  onAction: (action: BattleAction) => void;
}) {
  return (
    <main className="mx-auto max-w-[720px] space-y-3 p-6 text-zinc-900 dark:text-zinc-100">
      <HeaderPanel>
        <h1 className="text-lg font-bold">전투</h1>
      </HeaderPanel>
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
            <CastleTurret
              size={28}
              weight="duotone"
              className="text-violet-500"
            />
          }
          title="전쟁"
          onClick={() => onAction({ kind: "open-war" })}
        />
        <EntryCard
          icon={
            <Crosshair
              size={28}
              weight="duotone"
              className="text-orange-500"
            />
          }
          title="토벌"
          onClick={() => onAction({ kind: "open-subjugation" })}
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
