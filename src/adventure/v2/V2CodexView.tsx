"use client";

import { Package } from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  V2_MATERIALS,
  V2_MATERIAL_SELL_PRICE,
  MATERIAL_DROP_SOURCES,
  type V2MaterialId,
  type MaterialDropSource,
} from "@/adventure/data/v2/dungeonDrops";
import { MAIN_DUNGEON } from "@/adventure/data/v2/dungeon";
import type { DungeonFloorId } from "@/adventure/data/v2/types";

// v2 모험의 서 — 우선 "재료" 도감만. 라이브 모험의 서(재료 탭)의 v2 대응판.
// 정적 카탈로그(전부 공개, 조우/처치 게이팅 없음 — v2 엔 아직 추적 인프라 없음).
// 재료별로 "어느 구역에서 몇 % 로 떨어지나" 를 구역(floor) 단위로 보여준다.

// floor id → "들판 (Lv 1~5)" 식 표시명. MAIN_DUNGEON 이 단일 출처.
const FLOOR_LABEL: Record<DungeonFloorId, string> = (() => {
  const out = {} as Record<DungeonFloorId, string>;
  for (const f of MAIN_DUNGEON.floors) {
    const req =
      f.requirement.kind === "level"
        ? ` (Lv ${f.requirement.min}~${f.requirement.max})`
        : "";
    out[f.id] = `${f.name}${req}`;
  }
  return out;
})();

function formatChance(chance: number): string {
  return `${(chance * 100).toFixed(chance < 0.01 ? 2 : 1)}%`;
}

function formatAmount(s: MaterialDropSource): string {
  return s.amountMin === s.amountMax
    ? `×${s.amountMin}`
    : `×${s.amountMin}~${s.amountMax}`;
}

export function V2CodexView({ onBack }: { onBack: () => void }) {
  // 드랍 출처가 하나라도 있는 재료만 — 출처 없는 재료(미배치)는 도감에서 숨긴다.
  const entries = (Object.keys(V2_MATERIALS) as V2MaterialId[])
    .map((id) => ({
      id,
      material: V2_MATERIALS[id],
      sources: MATERIAL_DROP_SOURCES[id],
      sellPrice: V2_MATERIAL_SELL_PRICE[id],
    }))
    .filter((e) => e.sources.length > 0)
    .sort((a, b) => a.material.name.localeCompare(b.material.name));

  return (
    <main className="mx-auto max-w-[720px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <header className="space-y-2 border-b border-zinc-200 pb-3 dark:border-zinc-800">
        <button
          type="button"
          onClick={onBack}
          className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          ← 캐릭터로
        </button>
        <div>
          <h1 className="text-lg font-bold">모험의 서</h1>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            재료 — 어느 구역에서 어떤 재료가 떨어지는지 한눈에.
          </p>
        </div>
      </header>

      {entries.length === 0 ? (
        <EmptyState
          icon={<Package size={40} weight="duotone" />}
          title="아직 기록된 재료가 없습니다"
          message="사냥터 구역에 재료가 배치되면 여기에서 출처를 확인할 수 있습니다."
        />
      ) : (
        <Card padding="none" className="overflow-hidden">
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {entries.map(({ id, material, sources, sellPrice }) => (
              <li key={id} className="px-3 py-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    📦 {material.name}
                  </span>
                  <span className="shrink-0 text-[11px] text-zinc-500 dark:text-zinc-400">
                    판매 {sellPrice}골드
                  </span>
                </div>
                {material.description && (
                  <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                    {material.description}
                  </p>
                )}
                <ul className="mt-2 space-y-0.5 border-t border-dashed border-zinc-200 pt-1.5 text-[11px] dark:border-zinc-700">
                    {sources.map((s) => (
                    <li
                      key={s.floorId}
                      className="flex items-center justify-between gap-2 py-0.5"
                    >
                      <span className="flex items-center gap-1.5 text-zinc-800 dark:text-zinc-200">
                        <span className="text-zinc-400 dark:text-zinc-500">⛰️</span>
                        {FLOOR_LABEL[s.floorId]}
                        <span className="text-zinc-500 dark:text-zinc-400">
                          {formatAmount(s)}
                        </span>
                      </span>
                      <span className="tabular-nums text-zinc-500 dark:text-zinc-400">
                        {formatChance(s.chance)}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </main>
  );
}
