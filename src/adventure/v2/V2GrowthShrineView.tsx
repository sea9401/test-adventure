"use client";

import { useCallback, useEffect, useState } from "react";
import { GrowthShrineView } from "@/adventure/character/GrowthShrineView";
import type { StatKey } from "@/adventure/data/stats";

// v2 성장의 신전 — 라이브 GrowthShrineView wrap.
// 사냥 → 레벨업 → +1 단련 포인트 → 여기서 분배 → 사냥 강해짐.
// hunt route 가 이미 레벨업 시 training.v2.points 증가시킴.

type TrainingResponse = {
  ok?: boolean;
  unspentPoints?: number;
  revertPoints?: number;
  allocatedStats?: Record<StatKey, number>;
  baseStats?: Record<StatKey, number>;
  gold?: number;
  level?: number;
  error?: string;
};

export function V2GrowthShrineView({ onBack }: { onBack: () => void }) {
  const [data, setData] = useState<TrainingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v2/me/training");
      const j = (await res.json().catch(() => null)) as TrainingResponse | null;
      setData(j ?? { ok: false });
    } catch {
      setData({ ok: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleCommit = useCallback(
    async (deltas: Record<StatKey, number>) => {
      setMsg(null);
      try {
        const res = await fetch("/api/v2/me/training/commit", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ deltas }),
        });
        const j = (await res.json().catch(() => null)) as
          | { ok?: boolean; error?: string }
          | null;
        if (!j?.ok) {
          setMsg(`✗ ${j?.error ?? `http ${res.status}`}`);
          return;
        }
        await refresh();
      } catch (err) {
        setMsg(`✗ network: ${(err as Error).message}`);
      }
    },
    [refresh],
  );

  const handleBuyRevert = useCallback(
    async (qty: number) => {
      setMsg(null);
      try {
        const res = await fetch("/api/v2/me/training/buy-revert", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ qty }),
        });
        const j = (await res.json().catch(() => null)) as
          | { ok?: boolean; error?: string }
          | null;
        if (!j?.ok) {
          setMsg(`✗ ${j?.error ?? `http ${res.status}`}`);
          return;
        }
        await refresh();
      } catch (err) {
        setMsg(`✗ network: ${(err as Error).message}`);
      }
    },
    [refresh],
  );

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <header className="space-y-2 border-b border-zinc-200 pb-3 dark:border-zinc-800">
        <button
          type="button"
          onClick={onBack}
          className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          ← 메인으로
        </button>
        <h1 className="text-lg font-bold">성장의 신전</h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          레벨업 1당 단련 포인트 +1. 분배는 즉시 사냥에 반영.
        </p>
      </header>

      {loading || !data?.ok ? (
        <div className="text-sm text-zinc-500 dark:text-zinc-400">
          {loading ? "불러오는 중…" : "성장 정보를 불러오지 못했어요."}
        </div>
      ) : (
        <GrowthShrineView
          unspentPoints={data.unspentPoints ?? 0}
          revertPoints={data.revertPoints ?? 0}
          allocatedStats={
            data.allocatedStats ??
            ({ str: 0, dex: 0, vit: 0, spd: 0, luk: 0, int: 0 } as Record<StatKey, number>)
          }
          baseStats={
            data.baseStats ??
            ({ str: 3, dex: 3, vit: 3, spd: 3, luk: 3, int: 3 } as Record<StatKey, number>)
          }
          gold={data.gold ?? 0}
          level={data.level ?? 1}
          onCommit={handleCommit}
          onBuyRevertPoint={handleBuyRevert}
        />
      )}

      {msg && (
        <div className="text-xs text-rose-600 dark:text-rose-400">{msg}</div>
      )}
    </main>
  );
}
