"use client";

import {
  Backpack,
  BookOpen,
  Compass,
  Lightning,
  Sparkle,
  Strategy,
  UserCircle,
} from "@phosphor-icons/react";
import { EntryCard } from "@/components/ui/EntryCard";
import { V2_COMBAT_PATTERN_ENABLED } from "@/adventure/v2/combat/combatPattern";

// 캐릭터 탭 default — 내 정보 / 인벤토리 / 스킬 + 모험의 서. 마을과 같은 EntryCard 패턴.
// 장비 장착/해제는 인벤토리 안에서 처리. 모험의 서는 도감(우선 재료) — 맨 아래에 둔다.

export type CharacterAction =
  | { kind: "open-info" }
  | { kind: "open-inventory" }
  | { kind: "open-skills" }
  | { kind: "open-combat-pattern" }
  | { kind: "open-shrine" }
  | { kind: "open-quests" }
  | { kind: "open-codex" };

export function V2CharacterMenu({
  onAction,
}: {
  onAction: (action: CharacterAction) => void;
}) {
  return (
    <main className="mx-auto max-w-[720px] space-y-3 p-6 text-zinc-900 dark:text-zinc-100">
      <header>
        <h1 className="text-lg font-bold">캐릭터</h1>
      </header>
      <div className="space-y-2">
        <EntryCard
          icon={
            <UserCircle size={28} weight="duotone" className="text-amber-500" />
          }
          title="내 정보"
          onClick={() => onAction({ kind: "open-info" })}
        />
        <EntryCard
          icon={
            <Backpack size={28} weight="duotone" className="text-emerald-600" />
          }
          title="인벤토리"
          onClick={() => onAction({ kind: "open-inventory" })}
        />
        <EntryCard
          icon={
            <Lightning size={28} weight="duotone" className="text-violet-500" />
          }
          title="스킬"
          onClick={() => onAction({ kind: "open-skills" })}
        />
        {V2_COMBAT_PATTERN_ENABLED && (
          <EntryCard
            icon={
              <Strategy size={28} weight="duotone" className="text-indigo-500" />
            }
            title="전투 패턴"
            onClick={() => onAction({ kind: "open-combat-pattern" })}
          />
        )}
        <EntryCard
          icon={
            <Compass size={28} weight="duotone" className="text-rose-400" />
          }
          title="퀘스트"
          onClick={() => onAction({ kind: "open-quests" })}
        />
        <EntryCard
          icon={
            <Sparkle size={28} weight="duotone" className="text-violet-400" />
          }
          title="성장의 신전"
          onClick={() => onAction({ kind: "open-shrine" })}
        />
        <EntryCard
          icon={
            <BookOpen size={28} weight="duotone" className="text-sky-500" />
          }
          title="모험의 서"
          onClick={() => onAction({ kind: "open-codex" })}
        />
      </div>
    </main>
  );
}
