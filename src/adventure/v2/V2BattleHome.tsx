"use client";

import {
  Barbell,
  CastleTurret,
  Skull,
  Sword,
  Trophy,
} from "@phosphor-icons/react";
import { EntryCard } from "@/components/ui/EntryCard";
import { PageShell } from "@/components/ui/PageShell";
import { SubViewHeader } from "@/components/ui/SubViewHeader";

// 전투 탭 default — town/character 탭 패턴: EntryCard 사냥터/아레나/훈련장 진입.

export type BattleAction =
  | { kind: "open-dungeons" }
  | { kind: "open-coop" }
  | { kind: "open-arena" }
  | { kind: "open-sparring" }
  | { kind: "open-mastery-tower" };

export function V2BattleHome({
  onAction,
}: {
  onAction: (action: BattleAction) => void;
}) {
  return (
    <PageShell spacing="tight">
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
            <CastleTurret size={28} weight="duotone" className="text-emerald-500" />
          }
          title="숙련의 탑"
          onClick={() => onAction({ kind: "open-mastery-tower" })}
        />
      </div>
    </PageShell>
  );
}
