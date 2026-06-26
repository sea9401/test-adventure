"use client";

import { useMemo } from "react";
import { Diamond, Package } from "@phosphor-icons/react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { usePagination } from "@/lib/usePagination";
import {
  V2_MATERIALS,
  type V2MaterialId,
} from "@/adventure/data/v2/dungeonDrops";

// 재료 탭 — 보유 재료(드랍)만 모아 2열 카드 그리드 + 페이지네이션. 보유 0인 재료는 숨김.
export function MaterialsTab({
  materials,
  pageSize,
}: {
  materials: Partial<Record<V2MaterialId, number>>;
  pageSize: number;
}) {
  const ownedMaterials = useMemo(
    () =>
      (Object.keys(V2_MATERIALS) as V2MaterialId[])
        .map((id) => ({
          id,
          material: V2_MATERIALS[id],
          count: materials[id] ?? 0,
        }))
        .filter((e) => e.count > 0)
        .sort((a, b) => a.material.name.localeCompare(b.material.name)),
    [materials],
  );

  const materialPager = usePagination(ownedMaterials, pageSize, "material");

  return (
    <>
      <MaterialCardGrid materials={materialPager.pageItems} />
      <Pagination
        page={materialPager.page}
        pageCount={materialPager.pageCount}
        setPage={materialPager.setPage}
      />
    </>
  );
}

// 보유 재료 2열 카드 그리드 — 장비 카드(EquipmentCardGrid)와 동형. 좌상단 아이콘 +
//   우상단 수량 배지 + 등급색 없는 이름 + 설명(2줄). 재료는 굴림/장착이 없어 비상호작용 div.
function MaterialCardGrid({
  materials,
}: {
  materials: Array<{
    id: V2MaterialId;
    material: (typeof V2_MATERIALS)[V2MaterialId];
    count: number;
  }>;
}) {
  if (materials.length === 0) {
    return (
      <EmptyState
        icon={<Diamond size={40} weight="duotone" />}
        title="보유한 재료가 없습니다"
        message="거점 사냥터에서 사냥하면 모입니다."
      />
    );
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      {materials.map(({ id, material, count }) => (
        <div
          key={id}
          className="flex flex-col gap-1 rounded-lg border border-zinc-200 bg-white p-3 text-left dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="flex items-start justify-between gap-1">
            <Package size={20} weight="duotone" className="text-amber-500" />
            <span className="shrink-0 rounded bg-zinc-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              ×{count}
            </span>
          </div>
          <div className="truncate text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            {material.name}
          </div>
          <p className="line-clamp-2 text-[11px] text-zinc-500 dark:text-zinc-400">
            {material.description}
          </p>
        </div>
      ))}
    </div>
  );
}
