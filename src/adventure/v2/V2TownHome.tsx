"use client";

import {
  Bank,
  Buildings,
  Compass,
  CookingPot,
  FirstAid,
  Hammer,
  PottedPlant,
  Storefront,
  Toolbox,
} from "@phosphor-icons/react";
import {
  EntryTile,
  EntryTileGrid,
  type EntryTileStatusResolver,
} from "@/components/ui/EntryList";
import { PageShell } from "@/components/ui/PageShell";
import { SubViewHeader } from "@/components/ui/SubViewHeader";

// 마을 탭 default — 라이브 TownScreen 의 EntryCard 패턴.
// 생활 지도·생활 조합 작업장·치료소·은행·대장간·농장·주방.
// 성장의 신전은 캐릭터 탭으로 이관(2026-06-08).
// 길드 창단은 길드 탭으로 이관(시설 분리가 어색해 통합).

export type TownAction =
  | { kind: "open-association" }
  | { kind: "open-healing" }
  | { kind: "open-exchange" }
  | { kind: "open-smithy" }
  | { kind: "open-farm" }
  | { kind: "open-kitchen" }
  | { kind: "open-bank" }
  | { kind: "open-map" }
  | { kind: "open-life-workshop" };

export function V2TownHome({
  gameStateLoaded,
  onAction,
  viewerGuildId,
  menuStatus,
}: {
  gameStateLoaded: boolean;
  onAction: (action: TownAction) => void;
  viewerGuildId: number | null;
  /** 타일 아래 상태 한 줄(오늘 할 일). 주지 않으면 이름만 보인다. */
  menuStatus?: EntryTileStatusResolver;
}) {
  return (
    <PageShell spacing="tight">
      <SubViewHeader title="마을" />
      <EntryTileGrid>
        {gameStateLoaded && viewerGuildId == null && (
          <EntryTile
            icon={<Buildings size={24} weight="duotone" className="text-indigo-600" />}
            title="모험가 협회"
            status={menuStatus?.("/town/association", "모험가 협회")}
            onClick={() => onAction({ kind: "open-association" })}
          />
        )}
        <EntryTile
          icon={<Compass size={24} weight="duotone" className="text-sky-600" />}
          title="생활 지도"
          status={menuStatus?.("/map", "생활 지도")}
          onClick={() => onAction({ kind: "open-map" })}
        />
        <EntryTile
          icon={
            <Toolbox size={24} weight="duotone" className="text-amber-600" />
          }
          title="생활 의뢰·조합 작업장"
          status={menuStatus?.("/town/life-workshop", "생활 의뢰·조합 작업장")}
          onClick={() => onAction({ kind: "open-life-workshop" })}
        />
        <EntryTile
          icon={<FirstAid size={24} weight="duotone" className="text-rose-500" />}
          title="치료소"
          status={menuStatus?.("/town/healing", "치료소")}
          onClick={() => onAction({ kind: "open-healing" })}
        />
        <EntryTile
          icon={<Bank size={24} weight="duotone" className="text-yellow-600" />}
          title="은행"
          status={menuStatus?.("/town/bank", "은행")}
          onClick={() => onAction({ kind: "open-bank" })}
        />
        <EntryTile
          icon={
            <Storefront size={24} weight="duotone" className="text-orange-600" />
          }
          title="통합 교환소"
          status={menuStatus?.("/town/exchange", "통합 교환소")}
          onClick={() => onAction({ kind: "open-exchange" })}
        />
        <EntryTile
          icon={<Hammer size={24} weight="duotone" className="text-amber-600" />}
          title="대장간"
          status={menuStatus?.("/town/smithy", "대장간")}
          onClick={() => onAction({ kind: "open-smithy" })}
        />
        <EntryTile
          icon={
            <PottedPlant
              size={24}
              weight="duotone"
              className="text-emerald-500"
            />
          }
          title="모험가 농장"
          status={menuStatus?.("/town/farm", "모험가 농장")}
          onClick={() => onAction({ kind: "open-farm" })}
        />
        <EntryTile
          icon={
            <CookingPot
              size={24}
              weight="duotone"
              className="text-amber-600"
            />
          }
          title="주방"
          status={menuStatus?.("/town/kitchen", "주방")}
          onClick={() => onAction({ kind: "open-kitchen" })}
        />
      </EntryTileGrid>
    </PageShell>
  );
}
