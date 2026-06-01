"use client";

import { TreasureCollectionView } from "@/adventure/v2/TreasureCollectionView";

// /dev/treasure-collection 하니스 — 보관함 뷰 QA 용 mock(서버 없이). 함수 prop 은 클라에서 생성.
export function TreasureCollectionHarness() {
  const mock = [
    { instanceId: "1", antiqueId: "dragon_jade_seal", condition: 92, foundAt: 0 },
    { instanceId: "2", antiqueId: "celadon_vase", condition: 70, foundAt: 0 },
    { instanceId: "3", antiqueId: "gold_coin", condition: 55, foundAt: 0 },
    { instanceId: "4", antiqueId: "clay_shard", condition: 30, foundAt: 0 },
    { instanceId: "5", antiqueId: "copper_coin", condition: 12, foundAt: 0 },
  ];
  return (
    <TreasureCollectionView
      instances={mock}
      fragments={3}
      loading={false}
      onBack={() => {}}
    />
  );
}
