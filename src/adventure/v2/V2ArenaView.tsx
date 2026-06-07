"use client";

import { useCallback, useEffect, useState } from "react";
import { BackButton } from "@/components/ui/BackButton";
import { LoadErrorBanner } from "@/components/ui/LoadErrorBanner";
import { ReplayBattleScene } from "@/adventure/v2/ReplayBattleScene";
import { V2ArenaRankingTab } from "@/adventure/v2/V2ArenaRankingTab";
import { V2ArenaLoadoutTab } from "@/adventure/v2/V2ArenaLoadoutTab";
import { useGameState } from "@/adventure/v2/GameStateProvider";
import type { ReplayPayload } from "@/adventure/data/v2/replayPayload";
import { Sword, Coin, Trophy, FilmStrip } from "@phosphor-icons/react";

// v2 1:1 아레나 — 4탭: 메인(도전·결과·전투 로그) / 전투 기록(다시보기) / 순위표 / 세팅(로드아웃).

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

type ArenaHistoryEntry = {
  id: string;
  at: string;
  outcome: "win" | "loss" | "draw";
  opponent: { name: string; level: number };
  scoreBefore: number;
  scoreAfter: number;
  scoreDelta: number;
  goldGained: number;
  turns: number;
  replay: ReplayPayload;
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
      opponent: { name: string; level: number; score: number };
      historyEntry: ArenaHistoryEntry;
      dailyRemaining: number;
      dailyResetAt: string;
    }
  | {
      ok: false;
      error: string;
      dailyResetAt?: string;
    };

type Tab = "main" | "history" | "ranking" | "loadout";

const TABS: { id: Tab; label: string }[] = [
  { id: "main", label: "메인" },
  { id: "history", label: "전투 기록" },
  { id: "ranking", label: "순위표" },
  { id: "loadout", label: "세팅" },
];

const OUTCOME_LABEL: Record<ArenaHistoryEntry["outcome"], string> = {
  win: "승리",
  loss: "패배",
  draw: "무승부",
};

function outcomeColor(outcome: ArenaHistoryEntry["outcome"]): string {
  return outcome === "win"
    ? "text-emerald-600 dark:text-emerald-400"
    : outcome === "loss"
      ? "text-rose-600 dark:text-rose-400"
      : "text-zinc-600 dark:text-zinc-400";
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diff = Date.now() - then;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

export function V2ArenaView({ onBack }: { onBack: () => void }) {
  const { viewerName, viewerGender, playerSubtitle } = useGameState();
  const [tab, setTab] = useState<Tab>("main");
  const [state, setState] = useState<StateResp | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<
    Extract<MatchResp, { ok: true }> | null
  >(null);
  const [history, setHistory] = useState<ArenaHistoryEntry[]>([]);
  // 다시보기 중인 기록(방금 싸운 판 또는 목록에서 고른 과거 판). null = 닫힘.
  const [replayEntry, setReplayEntry] = useState<ArenaHistoryEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  const loadState = useCallback(async () => {
    setLoadError(false);
    try {
      const [stateRes, histRes] = await Promise.all([
        fetch("/api/v2/arena/state"),
        fetch("/api/v2/arena/history"),
      ]);
      const sj = (await stateRes.json().catch(() => null)) as StateResp | null;
      setState(sj);
      if (sj == null) setLoadError(true);
      const hj = (await histRes.json().catch(() => null)) as {
        ok?: boolean;
        history?: ArenaHistoryEntry[];
      } | null;
      if (hj?.ok && Array.isArray(hj.history)) setHistory(hj.history);
    } catch {
      setState(null);
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 1회 fetch
    loadState();
  }, [loadState]);

  const challenge = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v2/arena/match", { method: "POST" });
      const j = (await res.json().catch(() => null)) as MatchResp | null;
      if (j && j.ok) {
        setLastResult(j);
        setHistory((prev) => [j.historyEntry, ...prev].slice(0, 10));
        setReplayEntry(j.historyEntry); // 방금 싸운 판 전투 로그 자동 표시
        setState((prev) =>
          prev?.state
            ? {
                ...prev,
                state: {
                  ...prev.state,
                  score: j.scoreAfter,
                  dailyUsed: (prev.maxDaily ?? 10) - j.dailyRemaining,
                  dailyRemaining: j.dailyRemaining,
                  dailyResetAt: j.dailyResetAt,
                },
              }
            : prev,
        );
      } else if (j && !j.ok) {
        if (j.error === "daily_exhausted") {
          setError("오늘 할당된 매치를 모두 사용했어요.");
        } else if (j.error === "no_opponent") {
          setError(
            "지금은 상대할 모험가가 없어요. 다른 모험가가 늘어나면 다시 도전할 수 있어요. (매치는 차감되지 않았어요)",
          );
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

  const replayBlock = replayEntry && (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <FilmStrip size={16} className="text-amber-600 dark:text-amber-400" />
          전투 로그 ·{" "}
          <span className="font-normal text-zinc-500">
            vs {replayEntry.opponent?.name || "상대"} Lv.
            {replayEntry.opponent?.level ?? "?"} ·{" "}
            <span className={outcomeColor(replayEntry.outcome)}>
              {OUTCOME_LABEL[replayEntry.outcome]}
            </span>
          </span>
        </div>
        <button
          type="button"
          onClick={() => setReplayEntry(null)}
          className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          닫기
        </button>
      </div>
      <ReplayBattleScene
        key={replayEntry.id}
        payload={replayEntry.replay}
        playerName={viewerName}
        gender={viewerGender}
        exp={0}
        maxExp={1}
        playerSubtitle={playerSubtitle}
      />
    </section>
  );

  return (
    <main className="mx-auto max-w-[720px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <BackButton onClick={onBack} />

      <header className="flex items-center gap-3">
        <Sword size={28} weight="duotone" className="text-amber-600 dark:text-amber-400" />
        <h1 className="text-xl font-bold">아레나</h1>
      </header>

      {/* 탭 바 */}
      <nav className="flex gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={
              "flex-1 rounded-md px-2 py-1.5 text-sm font-medium transition " +
              (tab === t.id
                ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-zinc-100"
                : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200")
            }
          >
            {t.label}
          </button>
        ))}
      </nav>

      {loadError && <LoadErrorBanner onRetry={loadState} />}

      {tab === "main" && (
        <>
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
            <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-950 dark:text-red-300">
              {error}
            </div>
          )}

          {lastResult && (
            <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">결과</div>
                  <div className={"mt-0.5 text-lg font-bold " + outcomeColor(lastResult.outcome)}>
                    {OUTCOME_LABEL[lastResult.outcome]}
                  </div>
                </div>
                <div className="text-right text-xs text-zinc-500 dark:text-zinc-400">
                  {lastResult.turns} 턴
                </div>
              </div>
              <div className="mt-3 text-sm">
                상대 <strong>{lastResult.opponent.name}</strong>
                <span className="ml-1 text-zinc-500">Lv.{lastResult.opponent.level}</span>
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

          {replayBlock}
        </>
      )}

      {tab === "history" && (
        <>
          {history.length === 0 ? (
            <div className="py-8 text-center text-sm text-zinc-500">
              아직 전투 기록이 없어요. 메인에서 도전해 보세요.
            </div>
          ) : (
            <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
              <div className="mb-2 text-sm font-semibold">전투 기록 (최근 10판)</div>
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {history.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      onClick={() => setReplayEntry(h)}
                      className={
                        "flex w-full items-center gap-3 py-2 text-left text-sm transition hover:bg-zinc-50 dark:hover:bg-zinc-800/60 " +
                        (replayEntry?.id === h.id ? "bg-amber-50 dark:bg-amber-950/30" : "")
                      }
                    >
                      <span className={"w-10 shrink-0 font-bold " + outcomeColor(h.outcome)}>
                        {OUTCOME_LABEL[h.outcome]}
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        {h.opponent?.name || "상대"}
                        <span className="ml-1 text-xs text-zinc-500">
                          Lv.{h.opponent?.level ?? "?"}
                        </span>
                      </span>
                      <span
                        className={
                          "shrink-0 tabular-nums " +
                          (h.scoreDelta > 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : h.scoreDelta < 0
                              ? "text-rose-600 dark:text-rose-400"
                              : "text-zinc-500")
                        }
                      >
                        {h.scoreDelta >= 0 ? "+" : ""}
                        {h.scoreDelta}
                      </span>
                      <span className="hidden shrink-0 text-xs text-zinc-400 sm:inline">
                        {h.turns}턴
                      </span>
                      <span className="shrink-0 text-xs text-zinc-400">{timeAgo(h.at)}</span>
                      <FilmStrip size={14} className="shrink-0 text-zinc-400" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {replayBlock}
        </>
      )}

      {tab === "ranking" && <V2ArenaRankingTab />}

      {tab === "loadout" && <V2ArenaLoadoutTab />}
    </main>
  );
}
