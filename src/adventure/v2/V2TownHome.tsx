"use client";

import {
  Bank,
  FirstAid,
  Fish,
  Hammer,
  MagnifyingGlass,
  PottedPlant,
  Storefront,
} from "@phosphor-icons/react";
import { EntryCard } from "@/components/ui/EntryCard";
import { PageShell } from "@/components/ui/PageShell";
import { SubViewHeader } from "@/components/ui/SubViewHeader";

// 마을 탭 default — 라이브 TownScreen 의 EntryCard 패턴.
// 치료소·은행·상점·대장간·낚시·보물. 성장의 신전은 캐릭터 탭으로 이관(2026-06-08).
// 지도는 전투 탭(영토/전쟁 동선)으로 이관(2026-06-25).
// 길드 창단은 길드 탭으로 이관(시설 분리가 어색해 통합).

export type TownAction =
  | { kind: "open-healing" }
  | { kind: "open-shop" }
  | { kind: "open-smithy" }
  | { kind: "open-fishing" }
  | { kind: "open-farm" }
  | { kind: "open-treasure" }
  | { kind: "open-bank" };

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
        <EntryCard
          icon={
            <MagnifyingGlass
              size={28}
              weight="duotone"
              className="text-amber-500"
            />
          }
          title="발굴 감정소"
          onClick={() => onAction({ kind: "open-treasure" })}
        />
      </div>
    </PageShell>
  );
}
