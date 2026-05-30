"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowCounterClockwise, Minus, Plus } from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { STAT_KEYS, STAT_LABELS, type StatKey } from "@/adventure/data/stats";

// v2 성장의 신전 — 분배(양수)만 드래프트. 옛 revertPoints 폐기.
// 적립된 분배를 되돌릴 땐 "초기화" 한 번에 전부 환불.

type TrainingResponse = {
  ok?: boolean;
  unspentPoints?: number;
  allocatedStats?: Record<StatKey, number>;
  baseStats?: Record<StatKey, number>;
  error?: string;
};

const ZERO_DRAFT: Record<StatKey, number> = STAT_KEYS.reduce(
  (acc, k) => {
    acc[k] = 0;
    return acc;
  },
  {} as Record<StatKey, number>,
);

export function V2GrowthShrineView({ onBack }: { onBack: () => void }) {
  const [unspentPoints, setUnspentPoints] = useState(0);
  const [allocated, setAllocated] = useState<Record<StatKey, number>>(ZERO_DRAFT);
  const [base, setBase] = useState<Record<StatKey, number>>(ZERO_DRAFT);
  const [draft, setDraft] = useState<Record<StatKey, number>>(ZERO_DRAFT);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"commit" | "reset" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v2/me/training");
      const j = (await res.json().catch(() => null)) as TrainingResponse | null;
      if (j?.ok) {
        setUnspentPoints(j.unspentPoints ?? 0);
        setAllocated({ ...ZERO_DRAFT, ...(j.allocatedStats ?? {}) });
        setBase({ ...ZERO_DRAFT, ...(j.baseStats ?? {}) });
        setDraft({ ...ZERO_DRAFT });
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const draftTotal = useMemo(
    () => STAT_KEYS.reduce((s, k) => s + draft[k], 0),
    [draft],
  );
  const remaining = unspentPoints - draftTotal;

  const bump = (k: StatKey, step: number) => {
    if (step > 0) {
      if (remaining <= 0) return;
      const add = Math.min(step, remaining);
      setDraft((p) => ({ ...p, [k]: p[k] + add }));
    } else {
      const cur = draft[k];
      const dec = Math.min(-step, cur);
      if (dec <= 0) return;
      setDraft((p) => ({ ...p, [k]: p[k] - dec }));
    }
  };

  const handleCommit = useCallback(async () => {
    if (draftTotal <= 0) return;
    setBusy("commit");
    setMsg(null);
    try {
      const res = await fetch("/api/v2/me/training/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deltas: draft }),
      });
      const j = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        unspentPoints?: number;
        allocatedStats?: Record<StatKey, number>;
      } | null;
      if (!j?.ok) {
        setMsg(`✗ ${j?.error ?? `http ${res.status}`}`);
        return;
      }
      setMsg(`✓ ${draftTotal} 포인트 분배 완료`);
      setUnspentPoints(j.unspentPoints ?? 0);
      setAllocated({ ...ZERO_DRAFT, ...(j.allocatedStats ?? {}) });
      setDraft({ ...ZERO_DRAFT });
    } catch (err) {
      setMsg(`✗ ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  }, [draft, draftTotal]);

  const handleReset = useCallback(async () => {
    if (busy != null) return;
    if (
      !confirm(
        "분배한 모든 스탯을 0 으로 되돌리고 포인트를 환불한다. 진행할까?",
      )
    ) {
      return;
    }
    setBusy("reset");
    setMsg(null);
    try {
      const res = await fetch("/api/v2/me/training/reset", { method: "POST" });
      const j = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        unspentPoints?: number;
        allocatedStats?: Record<StatKey, number>;
        refunded?: number;
      } | null;
      if (!j?.ok) {
        setMsg(`✗ ${j?.error ?? `http ${res.status}`}`);
        return;
      }
      setMsg(`✓ ${j.refunded ?? 0} 포인트 환불`);
      setUnspentPoints(j.unspentPoints ?? 0);
      setAllocated({ ...ZERO_DRAFT, ...(j.allocatedStats ?? {}) });
      setDraft({ ...ZERO_DRAFT });
    } catch (err) {
      setMsg(`✗ ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  }, [busy]);

  return (
    <main className="mx-auto max-w-[720px] space-y-3 p-6 text-zinc-900 dark:text-zinc-100">
      <SubViewHeader title="성장의 신전" onBack={onBack} />

      <Card padding="md">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">스탯 분배</h2>
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            남은 포인트{" "}
            <strong className="tabular-nums text-emerald-700 dark:text-emerald-400">
              {remaining}
            </strong>
            {draftTotal > 0 && (
              <span className="ml-1 text-amber-600 dark:text-amber-400">
                (드래프트 +{draftTotal})
              </span>
            )}
          </div>
        </div>

        {loading ? (
          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
            불러오는 중…
          </p>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {STAT_KEYS.map((k) => {
              const baseV = base[k] ?? 0;
              const allocV = allocated[k] ?? 0;
              const draftV = draft[k] ?? 0;
              const total = baseV + allocV + draftV;
              return (
                <li
                  key={k}
                  className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 bg-zinc-50/50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/40"
                >
                  <div className="flex min-w-0 items-baseline gap-2">
                    <span className="text-sm font-semibold uppercase">
                      {k.toUpperCase()}
                    </span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      {STAT_LABELS[k]}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="tabular-nums text-sm">
                      {baseV}
                      <span className="text-zinc-400 dark:text-zinc-500">
                        {" "}
                        + {allocV}
                      </span>
                      {draftV > 0 && (
                        <span className="text-amber-600 dark:text-amber-400">
                          {" "}
                          + {draftV}
                        </span>
                      )}
                      <span className="ml-1 font-semibold">= {total}</span>
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        aria-label={`${k} -1`}
                        onClick={() => bump(k, -1)}
                        disabled={busy != null || draftV <= 0}
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      >
                        <Minus size={12} weight="bold" />
                      </button>
                      <button
                        type="button"
                        aria-label={`${k} +1`}
                        onClick={() => bump(k, 1)}
                        disabled={busy != null || remaining <= 0}
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40"
                      >
                        <Plus size={12} weight="bold" />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleCommit}
            disabled={busy != null || draftTotal <= 0}
            className="flex-1 rounded-md border border-emerald-600 bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === "commit" ? "확정 중…" : "확정"}
          </button>
          <button
            type="button"
            onClick={() => setDraft({ ...ZERO_DRAFT })}
            disabled={busy != null || draftTotal <= 0}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            드래프트 취소
          </button>
        </div>
      </Card>

      <Card padding="md">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">초기화</h2>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              분배한 스탯을 전부 되돌리고 포인트를 환불한다. 비용 없음.
            </p>
          </div>
          <button
            type="button"
            onClick={handleReset}
            disabled={busy != null}
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-rose-600 bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
          >
            <ArrowCounterClockwise size={14} weight="bold" />
            {busy === "reset" ? "환불 중…" : "초기화"}
          </button>
        </div>
      </Card>

      {msg && (
        <div
          className={`rounded-md border px-3 py-1.5 text-xs ${
            msg.startsWith("✓")
              ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
              : "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-700 dark:bg-rose-950/30 dark:text-rose-300"
          }`}
        >
          {msg}
        </div>
      )}
    </main>
  );
}
