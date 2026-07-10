"use client";

import {
  Bank,
  Compass,
  FirstAid,
  Hammer,
  PottedPlant,
  Storefront,
  TreeEvergreen,
} from "@phosphor-icons/react";
import { EntryCard } from "@/components/ui/EntryCard";
import { PageShell } from "@/components/ui/PageShell";
import { SubViewHeader } from "@/components/ui/SubViewHeader";

// 마을 탭 default — 라이브 TownScreen 의 EntryCard 패턴.
// 생활 지도·치료소·은행·상점·대장간·벌목장·농장.
// 성장의 신전은 캐릭터 탭으로 이관(2026-06-08).
// 길드 창단은 길드 탭으로 이관(시설 분리가 어색해 통합).

export type TownAction =
  | { kind: "open-healing" }
  | { kind: "open-shop" }
  | { kind: "open-smithy" }
  | { kind: "open-logging" }
  | { kind: "open-farm" }
  | { kind: "open-bank" }
  | { kind: "open-map" };

export function V2TownHome({
  onAction,
}: {
  onAction: (action: TownAction) => void;
}) {
  return (
    <PageShell spacing="tight">
      <SubViewHeader title="마을" />
      <div className="space-y-2">
        <EntryCard
          icon={<Compass size={28} weight="duotone" className="text-sky-600" />}
          title="생활 지도"
          onClick={() => onAction({ kind: "open-map" })}
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
          title="상점"
          onClick={() => onAction({ kind: "open-shop" })}
        />
        <EntryCard
          icon={<Hammer size={28} weight="duotone" className="text-amber-600" />}
          title="대장간"
          onClick={() => onAction({ kind: "open-smithy" })}
        />
        <EntryCard
          icon={
            <TreeEvergreen
              size={28}
              weight="duotone"
              className="text-emerald-600"
            />
          }
          title="벌목장"
          description="나무결에 맞춰 통나무를 얻는 생활 콘텐츠"
          onClick={() => onAction({ kind: "open-logging" })}
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
      </div>
    </PageShell>
  );
}
