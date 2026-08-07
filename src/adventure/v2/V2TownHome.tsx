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
import { EntryCard } from "@/components/ui/EntryCard";
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
      <div className="space-y-2">
        {gameStateLoaded && viewerGuildId == null && (
          <EntryCard
            icon={<Buildings size={28} weight="duotone" className="text-indigo-600" />}
            title="모험가 협회"
            onClick={() => onAction({ kind: "open-association" })}
          />
        )}
        <EntryCard
          icon={<Compass size={28} weight="duotone" className="text-sky-600" />}
          title="생활 지도"
          onClick={() => onAction({ kind: "open-map" })}
        />
        <EntryCard
          icon={
            <Toolbox size={28} weight="duotone" className="text-amber-600" />
          }
          title="생활 의뢰·조합 작업장"
          onClick={() => onAction({ kind: "open-life-workshop" })}
        />
        <EntryCard
          icon={<FirstAid size={28} weight="duotone" className="text-rose-500" />}
          title="치료소"
          onClick={() => onAction({ kind: "open-healing" })}
        />
        <EntryCard
          icon={<Bank size={28} weight="duotone" className="text-yellow-600" />}
          title="은행"
          onClick={() => onAction({ kind: "open-bank" })}
        />
        <EntryCard
          icon={
            <Storefront size={28} weight="duotone" className="text-orange-600" />
          }
          title="통합 교환소"
          onClick={() => onAction({ kind: "open-exchange" })}
        />
        <EntryCard
          icon={<Hammer size={28} weight="duotone" className="text-amber-600" />}
          title="대장간"
          onClick={() => onAction({ kind: "open-smithy" })}
        />
        <EntryCard
          icon={
            <PottedPlant
              size={28}
              weight="duotone"
              className="text-emerald-500"
            />
          }
          title="모험가 농장"
          onClick={() => onAction({ kind: "open-farm" })}
        />
        <EntryCard
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
      </div>
    </PageShell>
  );
}
