"use client";

import {
  Barbell,
  FirstAid,
  GraduationCap,
  Hammer,
  Shield,
  Sparkle,
  Storefront,
} from "@phosphor-icons/react";
import { EntryCard } from "@/components/ui/EntryCard";

// 마을 탭 default — 라이브 TownScreen 의 EntryCard 패턴.
// 치료소만 실제 동작, 상점·훈련장·대장간은 준비 중 placeholder.

export type TownAction =
  | { kind: "open-healing" }
  | { kind: "open-shop" }
  | { kind: "open-training" }
  | { kind: "open-smithy" }
  | { kind: "open-shrine" }
  | { kind: "open-instructors" }
  | { kind: "open-guild-hall" };

export function V2TownHome({
  onAction,
}: {
  onAction: (action: TownAction) => void;
}) {
  return (
    <main className="mx-auto max-w-3xl space-y-3 p-6 text-zinc-900 dark:text-zinc-100">
      <header>
        <h1 className="text-lg font-bold">마을</h1>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          모험가가 들르는 시설들.
        </p>
      </header>
      <div className="space-y-2">
        <EntryCard
          icon={<FirstAid size={28} weight="duotone" className="text-rose-500" />}
          title="치료소"
          description="지친 몸을 회복할 수 있는 곳."
          onClick={() => onAction({ kind: "open-healing" })}
        />
        <EntryCard
          icon={
            <Storefront size={28} weight="duotone" className="text-emerald-600" />
          }
          title="상점"
          description="HP·MP 물약을 구매. 골드를 들고 들르는 곳."
          onClick={() => onAction({ kind: "open-shop" })}
        />
        <EntryCard
          icon={<Barbell size={28} weight="duotone" className="text-slate-400" />}
          title="훈련장"
          description="기초를 다지는 곳. 준비 중."
          onClick={() => onAction({ kind: "open-training" })}
        />
        <EntryCard
          icon={<Sparkle size={28} weight="duotone" className="text-violet-400" />}
          title="성장의 신전"
          description="단련을 능력치로 새겨넣는 곳."
          onClick={() => onAction({ kind: "open-shrine" })}
        />
        <EntryCard
          icon={<Hammer size={28} weight="duotone" className="text-amber-600" />}
          title="대장간"
          description="장비를 두드려 벼리는 곳. 준비 중."
          onClick={() => onAction({ kind: "open-smithy" })}
        />
        <EntryCard
          icon={
            <GraduationCap
              size={28}
              weight="duotone"
              className="text-sky-500"
            />
          }
          title="전직 교관"
          description="6스탯 교관에게 골드를 내고 스킬을 배운다."
          onClick={() => onAction({ kind: "open-instructors" })}
        />
        <EntryCard
          icon={<Shield size={28} weight="duotone" className="text-indigo-500" />}
          title="길드 회관"
          description="새로운 길드를 세우거나 동료들과 깃발을 모은다."
          onClick={() => onAction({ kind: "open-guild-hall" })}
        />
      </div>
    </main>
  );
}
