"use client";

import {
  Backpack,
  BookOpen,
  Compass,
  Lightning,
  Sparkle,
  UserCircle,
} from "@phosphor-icons/react";
import { EntryCard } from "@/components/ui/EntryCard";
import { SubViewHeader } from "@/components/ui/SubViewHeader";

// 캐릭터 탭 default — 내 정보 / 인벤토리 / 스킬 + 모험의 서. 마을과 같은 EntryCard 패턴.
// 장비 장착/해제는 인벤토리 안에서 처리. 모험의 서는 도감(우선 재료) — 맨 아래에 둔다.

export type CharacterAction =
  | { kind: "open-info" }
  | { kind: "open-inventory" }
  | { kind: "open-skills" }
  | { kind: "open-shrine" }
  | { kind: "open-quests" }
  | { kind: "open-codex" }
  | { kind: "open-job-codex" };

export function V2CharacterMenu({
  onAction,
}: {
  onAction: (action: CharacterAction) => void;
}) {
  return (
    <main className="mx-auto max-w-[720px] space-y-3 p-6 text-zinc-900 dark:text-zinc-100">
      <SubViewHeader title="캐릭터" />
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
        <EntryCard
          icon={
            <Sparkle size={28} weight="duotone" className="text-teal-500" />
          }
          title="직업 도감"
          onClick={() => onAction({ kind: "open-job-codex" })}
        />
      </div>
    </main>
  );
}
