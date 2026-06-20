"use client";

import {
  Bank,
  CompassRose,
  FirstAid,
  Fish,
  Hammer,
  MagnifyingGlass,
  Storefront,
} from "@phosphor-icons/react";
import { EntryCard } from "@/components/ui/EntryCard";
import { SubViewHeader } from "@/components/ui/SubViewHeader";

// 마을 탭 default — 라이브 TownScreen 의 EntryCard 패턴.
// 지도(이동)·치료소·상점·대장간·낚시·보물. 성장의 신전은 캐릭터 탭으로 이관(2026-06-08).
// 지도는 전투 탭에서 이관(2026-06-11) — 이동/탐험은 마을 동선.
// 길드 창단은 길드 탭으로 이관(시설 분리가 어색해 통합).

export type TownAction =
  | { kind: "open-map" }
  | { kind: "open-healing" }
  | { kind: "open-shop" }
  | { kind: "open-smithy" }
  | { kind: "open-fishing" }
  | { kind: "open-treasure" }
  | { kind: "open-bank" };

export function V2TownHome({
  onAction,
}: {
  onAction: (action: TownAction) => void;
}) {
  return (
    <main className="mx-auto max-w-[720px] space-y-3 p-6 text-zinc-900 dark:text-zinc-100">
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
            <MagnifyingGlass
              size={28}
              weight="duotone"
              className="text-amber-500"
            />
          }
          title="발굴 감정소"
          onClick={() => onAction({ kind: "open-treasure" })}
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
    </main>
  );
}
