"use client";

import {
  Barbell,
  CastleTurret,
  Crosshair,
  Skull,
  Sword,
  Trophy,
} from "@phosphor-icons/react";
import { EntryCard } from "@/components/ui/EntryCard";
import { SubViewHeader } from "@/components/ui/SubViewHeader";

// 전투 탭 default — town/character 탭 패턴: EntryCard 사냥터/전황/아레나/훈련장 진입.
// 지도는 마을 탭으로 이관(2026-06-11).

export type BattleAction =
  | { kind: "open-dungeons" }
  | { kind: "open-coop" }
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
      <SubViewHeader title="전투" />
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
            <Skull size={28} weight="duotone" className="text-rose-500" />
          }
          title="협동 보스"
          onClick={() => onAction({ kind: "open-coop" })}
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
          title="훈련장"
          onClick={() => onAction({ kind: "open-sparring" })}
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
            <CastleTurret
              size={28}
              weight="duotone"
              className="text-violet-500"
            />
          }
          title="전쟁"
          onClick={() => onAction({ kind: "open-war" })}
        />
      </div>
    </main>
  );
}
