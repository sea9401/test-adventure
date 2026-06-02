"use client";

import {
  Barbell,
  FirstAid,
  Fish,
  Hammer,
  MagnifyingGlass,
  Sparkle,
  Storefront,
} from "@phosphor-icons/react";
import { EntryCard } from "@/components/ui/EntryCard";

// 마을 탭 default — 라이브 TownScreen 의 EntryCard 패턴.
// 치료소·상점·수행(숙련도 cap)·학습(시그니처)·대장간(재료 직접 제작) 동작.
// 길드 창단은 길드 탭으로 이관(시설 분리가 어색해 통합).

export type TownAction =
  | { kind: "open-healing" }
  | { kind: "open-shop" }
  | { kind: "open-training" }
  | { kind: "open-smithy" }
  | { kind: "open-shrine" }
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
          icon={<Sparkle size={28} weight="duotone" className="text-violet-400" />}
          title="성장의 신전"
          description="숙달 포인트로 능력치의 한계를 끌어올리는 곳."
          onClick={() => onAction({ kind: "open-shrine" })}
        />
        <EntryCard
          icon={<Barbell size={28} weight="duotone" className="text-sky-500" />}
          title="훈련장"
          description="숙달 포인트로 직업 전용 스킬을 익히고 대련하는 곳."
          onClick={() => onAction({ kind: "open-training" })}
        />
        <EntryCard
          icon={<Hammer size={28} weight="duotone" className="text-amber-600" />}
          title="대장간"
          description="들판에서 모은 재료로 장비를 벼리는 곳."
          onClick={() => onAction({ kind: "open-smithy" })}
        />
        <EntryCard
          icon={<Fish size={28} weight="duotone" className="text-cyan-500" />}
          title="낚시터"
          description="스태미나 없이 찌를 드리우는 곳. 잡은 물고기로 주간 대회에 도전한다."
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
          description="지도 조각으로 발굴 지점을 열고 단서로 매장지를 찾는 곳. 골동품을 캐낸다."
          onClick={() => onAction({ kind: "open-treasure" })}
        />
      </div>
    </main>
  );
}
