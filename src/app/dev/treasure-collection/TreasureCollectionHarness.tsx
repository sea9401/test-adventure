"use client";

import { useCallback, useState } from "react";
import {
  TreasureCollectionView,
  type CollectionInstance,
} from "@/adventure/v2/TreasureCollectionView";
import {
  ANTIQUES,
  ANTIQUE_TIERS,
  isAntiqueId,
} from "@/adventure/data/v2/antique";

// /dev/treasure-collection 하니스 — 보관함 뷰 QA 용 mock(서버 없이). 분해/코인은 로컬 누적.
const INITIAL: CollectionInstance[] = [
  { instanceId: "1", antiqueId: "dragon_jade_seal", condition: 92, foundAt: 0 },
  { instanceId: "2", antiqueId: "celadon_vase", condition: 70, foundAt: 0 },
  { instanceId: "3", antiqueId: "gold_coin", condition: 55, foundAt: 0 },
  { instanceId: "4", antiqueId: "clay_shard", condition: 30, foundAt: 0 },
  { instanceId: "5", antiqueId: "copper_coin", condition: 12, foundAt: 0 },
];

// instanceId → 분해 코인(초기 mock 기준 정적 lookup).
const COIN_BY_ID: Record<string, number> = Object.fromEntries(
  INITIAL.filter((i) => isAntiqueId(i.antiqueId)).map((i) => [
    i.instanceId,
    ANTIQUE_TIERS[ANTIQUES[i.antiqueId as keyof typeof ANTIQUES].tier]
      .dismantleCoins,
  ]),
);

export function TreasureCollectionHarness() {
  const [instances, setInstances] = useState<CollectionInstance[]>(INITIAL);
  const [coins, setCoins] = useState(3);

  const onDismantle = useCallback((instanceId: string) => {
    setInstances((xs) => xs.filter((x) => x.instanceId !== instanceId));
    setCoins((c) => c + (COIN_BY_ID[instanceId] ?? 0));
  }, []);

  return (
    <div className="space-y-3">
      <div className="mx-auto max-w-[520px] px-6 pt-4">
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          DEV 하니스 — 서버 없이 로컬 mock. 분해/코인은 이 페이지 안에서만 누적.
        </div>
      </div>
      <TreasureCollectionView
        instances={instances}
        fragments={3}
        coins={coins}
        loading={false}
        dismantling={null}
        onBack={() => {}}
        onDismantle={onDismantle}
        onOpenShop={() => {}}
      />
    </div>
  );
}
