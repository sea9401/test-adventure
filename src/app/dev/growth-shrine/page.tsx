"use client";

import { useState } from "react";
import { GrowthShrineView } from "@/adventure/character/GrowthShrineView";
import { STAT_KEYS, type StatKey } from "@/adventure/data/stats";

const zeroStats = () =>
  STAT_KEYS.reduce((o, k) => ({ ...o, [k]: 0 }), {}) as Record<StatKey, number>;

// #499 리스펙 골드 — 되돌리기 포인트 1개 = level×20G. 레벨 슬라이더로 가격 변화 확인.
export default function GrowthShrinePreview() {
  const [level, setLevel] = useState(100);
  const [gold, setGold] = useState(50000);
  const base: Record<StatKey, number> = { ...zeroStats(), str: 10, dex: 8, vit: 12, spd: 7, luk: 5 };
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        <strong>DEV</strong> · 성장의 신전 — 리스펙 골드(#499). 되돌리기 포인트 가격 = level×20.
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          레벨 {level}
          <input type="range" min={1} max={100} value={level}
            onChange={(e) => setLevel(Number(e.target.value))} />
        </label>
        <label className="flex items-center gap-2">
          골드 {gold.toLocaleString()}
          <input type="range" min={0} max={200000} step={1000} value={gold}
            onChange={(e) => setGold(Number(e.target.value))} />
        </label>
      </div>
      <GrowthShrineView
        unspentPoints={3}
        revertPoints={1}
        allocatedStats={{ ...zeroStats(), str: 5, vit: 3 }}
        baseStats={base}
        gold={gold}
        level={level}
        onCommit={(d) => console.log("[preview] commit", d)}
        onBuyRevertPoint={(q) => console.log("[preview] buyRevertPoint", q)}
      />
    </div>
  );
}
