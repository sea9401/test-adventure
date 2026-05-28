"use client";

import { useEffect, useState } from "react";
import { Diamond } from "@phosphor-icons/react";
import { EmptyState } from "@/components/ui/EmptyState";
import { LIST_ROW } from "@/components/ui/listRow";
import {
  V2_MATERIALS,
  type V2MaterialId,
} from "@/adventure/data/v2/dungeonDrops";

// v2 인벤토리 — 라이브 InventoryView 의 materials 섹션 패턴 차용.
// 현재 v2 가 가진 거 = placeholder 재료 5종(돌멩이/약초/슬라임조각/뼛조각/별빛가루).
// 장비/스킬북 등은 별 PR 에서.

type InventoryResponse = {
  ok?: boolean;
  materials?: Partial<Record<V2MaterialId, number>>;
};

export function V2InventoryView({ onBack }: { onBack: () => void }) {
  const [materials, setMaterials] = useState<
    Partial<Record<V2MaterialId, number>>
  >({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/v2/me/inventory");
        if (!cancelled && res.ok) {
          const j = (await res.json()) as InventoryResponse;
          setMaterials(j.materials ?? {});
        }
      } catch {}
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // V2_MATERIALS catalog 순서대로 표시. 보유 0 은 숨김.
  const owned = (Object.keys(V2_MATERIALS) as V2MaterialId[])
    .map((id) => ({
      id,
      material: V2_MATERIALS[id],
      count: materials[id] ?? 0,
    }))
    .filter((e) => e.count > 0)
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
        <h1 className="text-lg font-bold">인벤토리</h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          현재는 던전 사냥 드랍 재료만 표시 (장비/스킬북 등은 후속).
        </p>
      </header>

      {loading ? (
        <div className="text-sm text-zinc-500 dark:text-zinc-400">
          불러오는 중…
        </div>
      ) : owned.length === 0 ? (
        <EmptyState
          icon={<Diamond size={40} weight="duotone" />}
          title="보유한 재료가 없습니다"
          message="거점에서 던전 사냥을 하면 모입니다."
        />
      ) : (
        <ul className="space-y-1.5">
          {owned.map(({ id, material, count }) => (
            <li key={id} className={LIST_ROW}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {material.name}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                  ×{count}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                {material.description}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
