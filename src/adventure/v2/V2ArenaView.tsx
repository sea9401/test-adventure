"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Sword, Coin, Trophy } from "@phosphor-icons/react";

// v2 1:1 아레나 — PR-8a 코어 UI.
//
// 디자인 doc 9.1 확정안 그대로:
//   - 헤더: 점수 · 일일 잔여
//   - 본문: 도전 버튼 → 결과 카드
//   - PR-8a 는 결과 카드 간소형 (승패·턴·점수 변동·골드만). 최근 매치 리스트·마일스톤
//     진행도는 PR-8b 에서 추가.

type StateResp = {
  ok?: boolean;
  state?: {
    score: number;
    dailyUsed: number;
    dailyRemaining: number;
    dailyResetAt: string;
  };
  maxDaily?: number;
};

type MatchResp =
  | {
      ok: true;
      outcome: "win" | "loss" | "draw";
      turns: number;
      scoreBefore: number;
      scoreAfter: number;
      scoreDelta: number;
      goldGained: number;
      opponent: { name: string; level: number; score: number; isBot: boolean };
      dailyRemaining: number;
      dailyResetAt: string;
    }
  | {
      ok: false;
      error: string;
      dailyResetAt?: string;
    };

export function V2ArenaView({ onBack }: { onBack: () => void }) {
  const [state, setState] = useState<StateResp | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<
    Extract<MatchResp, { ok: true }> | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/v2/arena/state");
        const j = (await res.json().catch(() => null)) as StateResp | null;
        if (!cancelled) setState(j);
      } catch {
        if (!cancelled) setState(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const challenge = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v2/arena/match", { method: "POST" });
      const j = (await res.json().catch(() => null)) as MatchResp | null;
      if (j && j.ok) {
        setLastResult(j);
        // GET state 다시 안 해도 응답에 dailyRemaining 들어옴 → 로컬 갱신.
        setState((prev) =>
          prev?.state
            ? {
                ...prev,
                state: {
                  ...prev.state,
                  score: j.scoreAfter,
                  dailyUsed:
                    (prev.maxDaily ?? 10) - j.dailyRemaining,
                  dailyRemaining: j.dailyRemaining,
                  dailyResetAt: j.dailyResetAt,
                },
              }
            : prev,
        );
      } else if (j && !j.ok) {
        if (j.error === "daily_exhausted") {
          setError("오늘 할당된 매치를 모두 사용했어요.");
        } else if (j.error === "no_character") {
          setError("캐릭터가 없어 매치를 진행할 수 없습니다.");
        } else if (j.error === "unauthorized") {
          setError("로그인이 필요합니다.");
        } else {
          setError("매치를 시작할 수 없어요. 잠시 후 다시 시도해 주세요.");
        }
      } else {
        setError("네트워크 오류가 발생했어요.");
      }
    } catch {
      setError("네트워크 오류가 발생했어요.");
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const dailyRemaining = state?.state?.dailyRemaining ?? 0;
  const canChallenge = !busy && dailyRemaining > 0;

  return (
    <main className="mx-auto max-w-[720px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        <ArrowLeft size={16} /> 모험으로
      </button>

      <header className="flex items-center gap-3">
        <Sword size={28} weight="duotone" className="text-amber-600 dark:text-amber-400" />
        <h1 className="text-xl font-bold">아레나</h1>
      </header>

      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
          <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
            <Trophy size={14} /> 점수
          </div>
          <div className="mt-1 text-2xl font-bold tabular-nums">
            {state?.state?.score ?? 0}
          </div>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
          <div className="text-xs text-zinc-500 dark:text-zinc-400">오늘 잔여</div>
          <div className="mt-1 text-2xl font-bold tabular-nums">
            {dailyRemaining}
            <span className="ml-1 text-sm font-normal text-zinc-500">
              / {state?.maxDaily ?? 10}
            </span>
          </div>
        </div>
      </section>

      <button
        type="button"
        disabled={!canChallenge}
        onClick={challenge}
        className="w-full rounded-lg bg-amber-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-zinc-400 dark:bg-amber-500 dark:hover:bg-amber-400 dark:disabled:bg-zinc-700"
      >
        {busy
          ? "매치 진행 중..."
          : dailyRemaining > 0
            ? "도전"
            : "내일 다시 시도해 주세요"}
      </button>

      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      {lastResult && (
        <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">결과</div>
              <div
                className={
                  "mt-0.5 text-lg font-bold " +
                  (lastResult.outcome === "win"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : lastResult.outcome === "loss"
                      ? "text-rose-600 dark:text-rose-400"
                      : "text-zinc-600 dark:text-zinc-400")
                }
              >
                {lastResult.outcome === "win"
                  ? "승리"
                  : lastResult.outcome === "loss"
                    ? "패배"
                    : "무승부"}
              </div>
            </div>
            <div className="text-right text-xs text-zinc-500 dark:text-zinc-400">
              {lastResult.turns} 턴
            </div>
          </div>
          <div className="mt-3 text-sm">
            상대 <strong>{lastResult.opponent.name}</strong>
            <span className="ml-1 text-zinc-500">
              Lv.{lastResult.opponent.level}
              {lastResult.opponent.isBot ? " · 봇" : ""}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-md bg-zinc-50 p-3 dark:bg-zinc-900">
              <div className="text-xs text-zinc-500">점수</div>
              <div className="mt-0.5 font-semibold tabular-nums">
                {lastResult.scoreBefore} →{" "}
                <span
                  className={
                    lastResult.scoreDelta > 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : lastResult.scoreDelta < 0
                        ? "text-rose-600 dark:text-rose-400"
                        : ""
                  }
                >
                  {lastResult.scoreAfter}
                </span>
                <span className="ml-1 text-xs text-zinc-500">
                  ({lastResult.scoreDelta >= 0 ? "+" : ""}
                  {lastResult.scoreDelta})
                </span>
              </div>
            </div>
            <div className="rounded-md bg-zinc-50 p-3 dark:bg-zinc-900">
              <div className="flex items-center gap-1 text-xs text-zinc-500">
                <Coin size={12} /> 골드
              </div>
              <div className="mt-0.5 font-semibold tabular-nums">
                +{lastResult.goldGained}
              </div>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
