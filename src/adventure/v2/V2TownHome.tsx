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
import { EntryList, EntryRow } from "@/components/ui/EntryList";
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
}: {
  gameStateLoaded: boolean;
  onAction: (action: TownAction) => void;
  viewerGuildId: number | null;
}) {
  return (
    <PageShell spacing="tight">
      <SubViewHeader title="마을" />
      <EntryList>
        {gameStateLoaded && viewerGuildId == null && (
          <EntryRow
            icon={<Buildings size={28} weight="duotone" className="text-indigo-600" />}
            title="모험가 협회"
            onClick={() => onAction({ kind: "open-association" })}
          />
        )}
        <EntryRow
          icon={<Compass size={28} weight="duotone" className="text-sky-600" />}
          title="생활 지도"
          onClick={() => onAction({ kind: "open-map" })}
        />
        <EntryRow
          icon={
            <Toolbox size={28} weight="duotone" className="text-amber-600" />
          }
          title="생활 의뢰·조합 작업장"
          onClick={() => onAction({ kind: "open-life-workshop" })}
        />
        <EntryRow
          icon={<FirstAid size={28} weight="duotone" className="text-rose-500" />}
          title="치료소"
          image="/images/ui/healingcenter.webp"
          onClick={() => onAction({ kind: "open-healing" })}
        />
        <EntryRow
          icon={<Bank size={28} weight="duotone" className="text-yellow-600" />}
          title="은행"
          image="/images/ui/bank.webp"
          onClick={() => onAction({ kind: "open-bank" })}
        />
        <EntryRow
          icon={
            <Storefront size={28} weight="duotone" className="text-orange-600" />
          }
          title="통합 교환소"
          image="/images/ui/shop.webp"
          onClick={() => onAction({ kind: "open-exchange" })}
        />
        <EntryRow
          icon={<Hammer size={28} weight="duotone" className="text-amber-600" />}
          title="대장간"
          image="/images/ui/forge.webp"
          onClick={() => onAction({ kind: "open-smithy" })}
        />
        <EntryRow
          icon={
            <PottedPlant
              size={28}
              weight="duotone"
              className="text-emerald-500"
            />
          }
          title="모험가 농장"
          image="/images/ui/farm.webp"
          onClick={() => onAction({ kind: "open-farm" })}
        />
        <EntryRow
          icon={
            <CookingPot
              size={28}
              weight="duotone"
              className="text-amber-600"
            />
          }
          title="주방"
          onClick={() => onAction({ kind: "open-kitchen" })}
        />
      </EntryList>
    </PageShell>
  );
}
