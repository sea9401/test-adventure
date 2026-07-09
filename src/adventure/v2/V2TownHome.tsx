"use client";

import {
  Bank,
  Compass,
  FirstAid,
  Fish,
  Hammer,
  PottedPlant,
  Storefront,
} from "@phosphor-icons/react";
import { EntryCard } from "@/components/ui/EntryCard";
import { PageShell } from "@/components/ui/PageShell";
import { SubViewHeader } from "@/components/ui/SubViewHeader";

// 마을 탭 default — 라이브 TownScreen 의 EntryCard 패턴.
// 생활 지도·치료소·은행·상점·대장간·낚시·농장.
// 성장의 신전은 캐릭터 탭으로 이관(2026-06-08).
// 길드 창단은 길드 탭으로 이관(시설 분리가 어색해 통합).

export type TownAction =
  | { kind: "open-healing" }
  | { kind: "open-shop" }
  | { kind: "open-smithy" }
  | { kind: "open-fishing" }
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
          icon={<Compass size={28} weight="duotone" className="text-emerald-600" />}
          title="생활 지도"
          description="오늘의 소문과 자원 소식"
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
            <Storefront size={28} weight="duotone" className="text-emerald-600" />
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
          icon={<Fish size={28} weight="duotone" className="text-cyan-500" />}
          title="낚시터"
          onClick={() => onAction({ kind: "open-fishing" })}
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
          description="씨앗을 심고 기다렸다 수확하는 생활 콘텐츠"
          onClick={() => onAction({ kind: "open-farm" })}
        />
      </div>
    </PageShell>
  );
}
