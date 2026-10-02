"use client";

import {
  Barbell,
  CastleTurret,
  CloudLightning,
  Skull,
  Sword,
  Trophy,
} from "@phosphor-icons/react";
import { EntryList, EntryRow } from "@/components/ui/EntryList";
import { PageShell } from "@/components/ui/PageShell";
import { SubViewHeader } from "@/components/ui/SubViewHeader";

// 전투 탭 default — town/character 탭 패턴: EntryCard 사냥터/아레나/대련장 진입.

export type BattleAction =
  | { kind: "open-dungeons" }
  | { kind: "open-coop" }
  | { kind: "open-arena" }
  | { kind: "open-sparring" }
  | { kind: "open-mastery-tower" }
  | { kind: "open-storm-expedition" };

export function V2BattleHome({ onAction }: {
  onAction: (action: BattleAction) => void;
}) {
  return (
    <PageShell spacing="tight">
      <SubViewHeader title="전투" />
      <EntryList>
        <EntryRow
          icon={
            <Sword size={28} weight="duotone" className="text-rose-500" />
          }
          title="사냥터"
          image="/images/ui/hunt.webp"
          onClick={() => onAction({ kind: "open-dungeons" })}
        />
        <EntryRow
          icon={
            <Skull size={28} weight="duotone" className="text-rose-500" />
          }
          title="협동 보스"
          onClick={() => onAction({ kind: "open-coop" })}
        />
        <EntryRow
          icon={
            <Trophy size={28} weight="duotone" className="text-amber-500" />
          }
          title="아레나"
          image="/images/ui/arena.webp"
          onClick={() => onAction({ kind: "open-arena" })}
        />
        <EntryRow
          icon={
            <Barbell size={28} weight="duotone" className="text-sky-500" />
          }
          title="대련장"
          image="/images/monster/scarecrow.webp"
          onClick={() => onAction({ kind: "open-sparring" })}
        />
        <EntryRow
          icon={
            <CastleTurret size={28} weight="duotone" className="text-emerald-500" />
          }
          title="숙련의 탑"
          image="/images/ui/masterytower.webp"
          onClick={() => onAction({ kind: "open-mastery-tower" })}
        />
        <EntryRow
          icon={
            <CloudLightning size={28} weight="duotone" className="text-sky-500" />
          }
          title="던전"
          onClick={() => onAction({ kind: "open-storm-expedition" })}
        />
      </EntryList>
    </PageShell>
  );
}
