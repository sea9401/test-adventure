"use client";

import { useState } from "react";
import {
  TreasureCollectionView,
  type CollectionInstance,
} from "@/adventure/v2/TreasureCollectionView";

// /dev/treasure-collection 하니스 — 보관함 뷰 QA 용 mock(서버 없이).
// (분해→코인은 폐지 — 판매만 남음, 2026-06-13)
const INITIAL: CollectionInstance[] = [
  { instanceId: "1", antiqueId: "dragon_jade_seal", condition: 92, foundAt: 0 },
  { instanceId: "2", antiqueId: "celadon_vase", condition: 70, foundAt: 0 },
  { instanceId: "3", antiqueId: "gold_coin", condition: 55, foundAt: 0 },
  { instanceId: "4", antiqueId: "clay_shard", condition: 30, foundAt: 0 },
  { instanceId: "5", antiqueId: "copper_coin", condition: 12, foundAt: 0 },
];

export function TreasureCollectionHarness() {
  const [instances, setInstances] = useState<CollectionInstance[]>(INITIAL);

  return (
    <div className="space-y-3">
      <div className="mx-auto max-w-[520px] px-6 pt-4">
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          DEV 하니스 — 서버 없이 로컬 mock. 판매는 목록에서만 제거.
        </div>
      </div>
      <TreasureCollectionView
        instances={instances}
        selling={null}
        onSell={(instanceId) => {
          // mock — 골드 적립 없이 목록에서만 제거.
          setInstances((xs) => xs.filter((x) => x.instanceId !== instanceId));
        }}
        fragments={3}
        coins={3}
        loading={false}
        onBack={() => {}}
        onOpenShop={() => {}}
      />
    </div>
  );
}
