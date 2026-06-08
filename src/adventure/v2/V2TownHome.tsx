"use client";

import {
  FirstAid,
  Fish,
  Hammer,
  MagnifyingGlass,
  Storefront,
} from "@phosphor-icons/react";
import { EntryCard } from "@/components/ui/EntryCard";

// 마을 탭 default — 라이브 TownScreen 의 EntryCard 패턴.
// 치료소·상점·대장간·낚시·보물 동작. 성장의 신전은 캐릭터 탭으로 이관(2026-06-08).
// 길드 창단은 길드 탭으로 이관(시설 분리가 어색해 통합).

export type TownAction =
  | { kind: "open-healing" }
  | { kind: "open-shop" }
  | { kind: "open-smithy" }
  | { kind: "open-fishing" }
  | { kind: "open-treasure" };

export function V2TownHome({
  onAction,
}: {
  onAction: (action: TownAction) => void;
}) {
  return (
    <main className="mx-auto max-w-[720px] space-y-3 p-6 text-zinc-900 dark:text-zinc-100">
      <header>
        <h1 className="text-lg font-bold">마을</h1>
      </header>
      <div className="space-y-2">
        <EntryCard
          icon={<FirstAid size={28} weight="duotone" className="text-rose-500" />}
          title="치료소"
          onClick={() => onAction({ kind: "open-healing" })}
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
      </div>
    </main>
  );
}
