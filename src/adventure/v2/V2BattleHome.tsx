"use client";

import {
  Barbell,
  CompassRose,
  Crosshair,
  Skull,
  Sword,
  Trophy,
  Wall,
} from "@phosphor-icons/react";
import { EntryCard } from "@/components/ui/EntryCard";
import { PageShell } from "@/components/ui/PageShell";
import { SubViewHeader } from "@/components/ui/SubViewHeader";

// 전투 탭 default — town/character 탭 패턴: EntryCard 사냥터/아레나/훈련장 진입.
// 지도는 전투 탭 최하단(영토/전쟁 동선) — 마을 탭에서 이관(2026-06-25).

export type BattleAction =
  | { kind: "open-dungeons" }
  | { kind: "open-grid-dungeon" }
  | { kind: "open-coop" }
  | { kind: "open-subjugation" }
  | { kind: "open-arena" }
  | { kind: "open-sparring" }
  | { kind: "open-map" };

export function V2BattleHome({
  onAction,
  showGridDungeonEntry = false,
}: {
  onAction: (action: BattleAction) => void;
  showGridDungeonEntry?: boolean;
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
        {showGridDungeonEntry && (
          <EntryCard
            icon={
              <Wall size={28} weight="duotone" className="text-amber-500" />
            }
            title="던전 입장"
            onClick={() => onAction({ kind: "open-grid-dungeon" })}
          />
        )}
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
            <CompassRose
              size={28}
              weight="duotone"
              className="text-emerald-500"
            />
          }
          title="지도"
          onClick={() => onAction({ kind: "open-map" })}
        />
      </div>
    </PageShell>
  );
}
