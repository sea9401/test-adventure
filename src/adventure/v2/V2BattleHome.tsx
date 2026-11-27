"use client";

import {
  Barbell,
  CastleTurret,
  CloudLightning,
  Skull,
  Sword,
  Trophy,
} from "@phosphor-icons/react";
import {
  EntryTile,
  EntryTileGrid,
  type EntryTileStatusResolver,
} from "@/components/ui/EntryList";
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

export function V2BattleHome({
  onAction,
  menuStatus,
}: {
  onAction: (action: BattleAction) => void;
  /** 타일 아래 상태 한 줄(오늘 할 일). 주지 않으면 이름만 보인다. */
  menuStatus?: EntryTileStatusResolver;
}) {
  return (
    <PageShell spacing="tight">
      <SubViewHeader title="전투" />
      <EntryTileGrid>
        <EntryTile
          icon={
            <Sword size={24} weight="duotone" className="text-rose-500" />
          }
          title="사냥터"
          status={menuStatus?.("/battle/dungeon", "사냥터")}
          onClick={() => onAction({ kind: "open-dungeons" })}
        />
        <EntryTile
          icon={
            <Skull size={24} weight="duotone" className="text-rose-500" />
          }
          title="협동 보스"
          status={menuStatus?.("/battle/coop", "협동 보스")}
          onClick={() => onAction({ kind: "open-coop" })}
        />
        <EntryTile
          icon={
            <Trophy size={24} weight="duotone" className="text-amber-500" />
          }
          title="아레나"
          status={menuStatus?.("/battle/arena", "아레나")}
          onClick={() => onAction({ kind: "open-arena" })}
        />
        <EntryTile
          icon={
            <Barbell size={24} weight="duotone" className="text-sky-500" />
          }
          title="대련장"
          status={menuStatus?.("/battle/sparring", "대련장")}
          onClick={() => onAction({ kind: "open-sparring" })}
        />
        <EntryTile
          icon={
            <CastleTurret size={24} weight="duotone" className="text-emerald-500" />
          }
          title="숙련의 탑"
          status={menuStatus?.("/battle/mastery-tower", "숙련의 탑")}
          onClick={() => onAction({ kind: "open-mastery-tower" })}
        />
        <EntryTile
          icon={
            <CloudLightning size={24} weight="duotone" className="text-sky-500" />
          }
          title="던전"
          status={menuStatus?.("/battle/dungeons", "던전")}
          onClick={() => onAction({ kind: "open-storm-expedition" })}
        />
      </EntryTileGrid>
    </PageShell>
  );
}
