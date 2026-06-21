"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { StatBar } from "@/components/ui/StatBar";

// 정착지 전쟁 — 치료소 건강도(전쟁 전용 HP/MP 이월) 회복 카드. 설계: docs/v2-settlement-warfare-plan.md §2.1.
//   현재 건강도를 보여주고, "건강도 회복"으로 시간누적 회복분을 적용한다(서버가 경과로 계산).
//   V2HealingView 에서 V2_SETTLEMENT_WARFARE 플래그가 켜졌을 때만 렌더.

type Vigor = { hp: number; mp: number; at: number };

export default function WarVigorCard() {
  const [vigor, setVigor] = useState<Vigor | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/v2/me/war-vigor/recover");
      const j = r.ok ? await r.json() : null;
      if (j?.ok && j.warVigor) setVigor(j.warVigor as Vigor);
    } catch {
      /* 표시 전용 — 실패 시 빈 상태 유지 */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const recover = useCallback(async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/v2/me/war-vigor/recover", { method: "POST" });
      const j = r.ok ? await r.json() : null;
      if (j?.ok && j.warVigor) {
        setVigor(j.warVigor as Vigor);
        setMsg("✓ 건강도 회복 적용");
      }
    } catch {
      /* no-op */
    } finally {
      setBusy(false);
    }
  }, []);

  const pct = (x: number) => Math.round((x ?? 0) * 100);
  const full = !!vigor && vigor.hp >= 1 && vigor.mp >= 1;

  return (
    <Card padding="md">
      <h2 className="text-sm font-semibold">건강도 (전쟁 전용)</h2>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        약탈·정복 전투는 일반 체력이 아닌 <strong>건강도</strong>로 치러진다.
        시간이 지나며 회복분이 쌓이고, 치료소에 방문하면 적용된다.
      </p>
      <div className="mt-3 space-y-2">
        <StatBar
          label="건강도 HP"
          value={vigor ? pct(vigor.hp) : 0}
          max={100}
          color="bg-amber-500"
        />
        <StatBar
          label="건강도 MP"
          value={vigor ? pct(vigor.mp) : 0}
          max={100}
          color="bg-amber-400"
        />
      </div>
      <button
        type="button"
        onClick={recover}
        disabled={busy || vigor === null || full}
        className="mt-4 w-full rounded-md border border-amber-600 bg-amber-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {vigor === null
          ? "..."
          : full
            ? "건강도가 가득 차 있다"
            : "건강도 회복"}
      </button>
      {msg && (
        <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
          {msg}
        </p>
      )}
    </Card>
  );
}
