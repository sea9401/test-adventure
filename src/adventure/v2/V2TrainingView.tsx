"use client";

import { useCallback, useEffect, useState } from "react";
import { Sword } from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { formatDuration } from "@/lib/format";

// v2 훈련장 — 12시간 1회 훈련, 완료 시 스탯 포인트 2 적립.
// 서버 권위 (training.v2.endsAt). useTraining(클라) 폐기.
// 완료 후 claim 호출 → points 가산. 적립한 포인트는 성장의 신전에서 사용.

const TRAINING_DURATION_MS = 12 * 60 * 60 * 1000;
const TRAINING_REWARD_POINTS = 2;

type TrainingState = {
  endsAt: number | null;
  unspentPoints: number;
  completedCount: number;
};

export function V2TrainingView({
  onBack,
  onStartSparring,
}: {
  onBack: () => void;
  onStartSparring: () => void;
}) {
  const [state, setState] = useState<TrainingState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState<"start" | "claim" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/v2/me/training");
      const j = (await res.json().catch(() => null)) as {
        ok?: boolean;
        endsAt?: number | null;
        unspentPoints?: number;
        completedCount?: number;
      } | null;
      if (j?.ok) {
        setState({
          endsAt: j.endsAt ?? null,
          unspentPoints: j.unspentPoints ?? 0,
          completedCount: j.completedCount ?? 0,
        });
      }
    } catch {}
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // 진행 중일 때 1초 단위로 now 갱신 — 카운트다운.
  useEffect(() => {
    if (!state?.endsAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [state?.endsAt]);

  const handleStart = useCallback(async () => {
    setBusy("start");
    setMsg(null);
    try {
      const res = await fetch("/api/v2/me/training/start", { method: "POST" });
      const j = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        endsAt?: number;
      } | null;
      if (!j?.ok) {
        setMsg(`✗ ${j?.error ?? `http ${res.status}`}`);
        return;
      }
      setState((prev) =>
        prev ? { ...prev, endsAt: j.endsAt ?? null } : prev,
      );
      setNow(Date.now());
    } catch (err) {
      setMsg(`✗ ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  }, []);

  const handleClaim = useCallback(async () => {
    setBusy("claim");
    setMsg(null);
    try {
      const res = await fetch("/api/v2/me/training/claim", { method: "POST" });
      const j = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        points?: number;
        completedCount?: number;
        reward?: number;
      } | null;
      if (!j?.ok) {
        setMsg(`✗ ${j?.error ?? `http ${res.status}`}`);
        return;
      }
      setMsg(`✓ 스탯 포인트 +${j.reward ?? TRAINING_REWARD_POINTS} 적립`);
      setState((prev) =>
        prev
          ? {
              ...prev,
              endsAt: null,
              unspentPoints: j.points ?? prev.unspentPoints,
              completedCount: j.completedCount ?? prev.completedCount,
            }
          : prev,
      );
    } catch (err) {
      setMsg(`✗ ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  }, []);

  const endsAt = state?.endsAt ?? null;
  const remaining = endsAt ? Math.max(0, endsAt - now) : 0;
  const isTraining = endsAt != null && remaining > 0;
  const isClaimable = endsAt != null && remaining <= 0;

  return (
    <main className="mx-auto max-w-[720px] space-y-3 p-6 text-zinc-900 dark:text-zinc-100">
      <SubViewHeader title="훈련장" onBack={onBack} />
      <Card padding="lg">
        <div className="space-y-4">
          {isClaimable ? (
            <button
              type="button"
              onClick={handleClaim}
              disabled={busy !== null}
              className="w-full rounded-md border border-emerald-600 bg-emerald-600 px-4 py-3 text-base font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy === "claim"
                ? "수령 중…"
                : `훈련 완료 — 스탯 포인트 +${TRAINING_REWARD_POINTS} 받기`}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStart}
              disabled={busy !== null || isTraining || state == null}
              className="w-full rounded-md border border-zinc-300 bg-zinc-50 px-4 py-3 text-base font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              {isTraining
                ? `훈련 중 · ${formatDuration(remaining)}`
                : `${TRAINING_DURATION_MS / 3_600_000}시간 훈련 시작`}
            </button>
          )}
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            훈련을 마치면 스탯 포인트 {TRAINING_REWARD_POINTS}개를 얻는다.
            보유 스탯 포인트{" "}
            <strong className="tabular-nums text-emerald-700 dark:text-emerald-400">
              {state?.unspentPoints ?? 0}
            </strong>
            개. 능력치로 새겨넣으려면 <strong>성장의 신전</strong>에서 사용한다.
          </p>
          <div className="flex items-center justify-between border-t border-zinc-200 pt-3 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            <span>누적 훈련 횟수</span>
            <span className="tabular-nums text-zinc-700 dark:text-zinc-200">
              {state?.completedCount ?? 0}회
            </span>
          </div>
        </div>
      </Card>

      <Card padding="md">
        <button
          type="button"
          onClick={onStartSparring}
          className="flex w-full items-center justify-between gap-3 rounded-md text-left transition-colors"
        >
          <span className="flex items-center gap-3">
            <Sword size={28} weight="duotone" className="text-zinc-500" />
            <span className="flex flex-col">
              <span className="text-base font-medium text-zinc-900 dark:text-zinc-100">
                허수아비치기
              </span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                공격력도 방어력도 없는 허수아비다. 모의전으로 전투 기록을
                확인한다.
              </span>
            </span>
          </span>
        </button>
      </Card>
      {msg && (
        <div
          className={`rounded-md border px-3 py-1.5 text-xs ${
            msg.startsWith("✓")
              ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
              : "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-300"
          }`}
        >
          {msg}
        </div>
      )}
    </main>
  );
}
