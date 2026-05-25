"use client";

import { Plus } from "@phosphor-icons/react";
import { EntryCard } from "@/components/ui/EntryCard";

// 마을 탭 default — 라이브 TownScreen 의 EntryCard 패턴.
// 일단 성장의 신전만. 향후 상점·대장간·길드 회관 등 시설 추가.

export type TownAction = { kind: "open-shrine" };

export function V2TownHome({
  onAction,
}: {
  onAction: (action: TownAction) => void;
}) {
  return (
    <main className="mx-auto max-w-2xl space-y-3 p-6 text-zinc-900 dark:text-zinc-100">
      <header>
        <h1 className="text-lg font-bold">마을</h1>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          모험가가 들르는 시설들. 상점·대장간 등은 후속.
        </p>
      </header>
      <div className="space-y-2">
        <EntryCard
          icon={<Plus size={28} weight="duotone" className="text-violet-600" />}
          title="성장의 신전"
          description="레벨업 단련 포인트 분배."
          onClick={() => onAction({ kind: "open-shrine" })}
        />
      </div>
    </main>
  );
}
