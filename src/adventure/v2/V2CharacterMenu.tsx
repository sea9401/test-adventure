"use client";

import { Backpack, Sparkle, UserCircle } from "@phosphor-icons/react";
import { EntryCard } from "@/components/ui/EntryCard";

// 캐릭터 탭 default — 3 진입(내 정보 / 인벤토리 / 스킬). 마을과 같은 EntryCard 패턴.
// 장비 진입은 "내 정보" 안의 슬롯 클릭으로.

export type CharacterAction =
  | { kind: "open-info" }
  | { kind: "open-inventory" }
  | { kind: "open-skills" };

export function V2CharacterMenu({
  onAction,
}: {
  onAction: (action: CharacterAction) => void;
}) {
  return (
    <main className="mx-auto max-w-3xl space-y-3 p-6 text-zinc-900 dark:text-zinc-100">
      <header>
        <h1 className="text-lg font-bold">캐릭터</h1>
      </header>
      <div className="space-y-2">
        <EntryCard
          icon={
            <UserCircle size={28} weight="duotone" className="text-amber-500" />
          }
          title="내 정보"
          description="레벨·능력치·장비 슬롯."
          onClick={() => onAction({ kind: "open-info" })}
        />
        <EntryCard
          icon={
            <Backpack size={28} weight="duotone" className="text-emerald-600" />
          }
          title="인벤토리"
          description="보유 아이템과 재료."
          onClick={() => onAction({ kind: "open-inventory" })}
        />
        <EntryCard
          icon={
            <Sparkle size={28} weight="duotone" className="text-violet-500" />
          }
          title="스킬"
          description="습득 스킬·전투 슬롯."
          onClick={() => onAction({ kind: "open-skills" })}
        />
      </div>
    </main>
  );
}
