"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Coin, FilmStrip, Sword, Trophy } from "@phosphor-icons/react";
import { ReplayBattleScene } from "@/adventure/v2/ReplayBattleScene";
import { useGameState } from "@/adventure/v2/GameStateProvider";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { LoadErrorBanner } from "@/components/ui/LoadErrorBanner";
import type { ReplayPayload } from "@/adventure/data/v2/replayPayload";

type ArenaHistoryEntry = {
  id: string;
  at: string;
  outcome: "win" | "loss" | "draw";
  opponent: { name: string; level: number; userId?: string; botId?: string };
  scoreBefore: number;
  scoreAfter: number;
  scoreDelta: number;
  goldGained: number;
  turns: number;
  replay: ReplayPayload;
};

type HistoryResp =
  | { ok: true; history: ArenaHistoryEntry[] }
  | { ok?: false; error?: string };

type StateResp = {
  ok?: boolean;
  state?: {
    cooldownRemainingMs: number;
  };
};

type MatchResp =
  | {
      ok: true;
      historyEntry: ArenaHistoryEntry;
      cooldownMs: number;
    }
  | {
      ok: false;
      error: string;
      cooldownMs?: number;
    };

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

function scoreColor(delta: number): string {
  if (delta > 0) return "text-emerald-600 dark:text-emerald-400";
  if (delta < 0) return "text-rose-600 dark:text-rose-400";
  return "text-zinc-600 dark:text-zinc-400";
}

function formatKst(iso: string): string {
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(time));
}

export function V2ArenaReplayView({ entryId }: { entryId: string }) {
  const router = useRouter();
  const { viewerName, viewerGender, playerSubtitle } = useGameState();
  const [entry, setEntry] = useState<ArenaHistoryEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [nextBusy, setNextBusy] = useState(false);
  const [nextError, setNextError] = useState<string | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const loadEntry = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    setNotFound(false);
    try {
      const [res, stateRes] = await Promise.all([
        fetch("/api/v2/arena/history"),
        fetch("/api/v2/arena/state"),
      ]);
      const json = (await res.json().catch(() => null)) as HistoryResp | null;
      const stateJson = (await stateRes.json().catch(() => null)) as StateResp | null;
      const cooldownMs = stateJson?.state?.cooldownRemainingMs ?? 0;
      if (cooldownMs > 0) {
        const now = Date.now();
        setNowMs(now);
        setCooldownUntil(now + cooldownMs);
      }
      if (!json?.ok || !Array.isArray(json.history)) {
        setEntry(null);
        setLoadError(true);
        return;
      }
      const found = json.history.find((h) => h.id === entryId) ?? null;
      setEntry(found);
      setNotFound(!found);
    } catch {
      setEntry(null);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [entryId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 페이지 진입 시 서버 기록을 불러온다.
    loadEntry();
  }, [loadEntry]);

  useEffect(() => {
    if (cooldownUntil <= 0) return;
    const interval = setInterval(() => setNowMs(Date.now()), 250);
    const timeout = setTimeout(
      () => setCooldownUntil(0),
      Math.max(0, cooldownUntil - Date.now()) + 50,
    );
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [cooldownUntil]);

  const startNextMatch = useCallback(async () => {
    if (nextBusy || cooldownUntil > Date.now()) return;
    setNextBusy(true);
    setNextError(null);
    try {
      const res = await fetch("/api/v2/arena/match", { method: "POST" });
      const json = (await res.json().catch(() => null)) as MatchResp | null;
      if (json?.ok) {
        router.push(
          `/battle/arena/${encodeURIComponent(json.historyEntry.id)}`,
        );
        return;
      }
      if (json?.error === "cooldown") {
        const cooldownMs = json.cooldownMs ?? 10_000;
        setNowMs(Date.now());
        setCooldownUntil(Date.now() + cooldownMs);
        setNextError(null);
      } else if (json?.error === "no_opponent") {
        setNextError("지금은 상대할 모험가가 없습니다.");
      } else if (json?.error === "no_character") {
        setNextError("캐릭터가 없어 매치를 진행할 수 없습니다.");
      } else if (json?.error === "unauthorized") {
        setNextError("로그인이 필요합니다.");
      } else {
        setNextError("다음 전투를 시작할 수 없습니다. 잠시 후 다시 시도해 주세요.");
      }
    } catch {
      setNextError("네트워크 오류가 발생했습니다.");
    } finally {
      setNextBusy(false);
    }
  }, [cooldownUntil, nextBusy, router]);

  const battleOutcome = useMemo(() => {
    if (!entry) return undefined;
    if (entry.outcome === "win") return "win";
    if (entry.outcome === "loss") return "lose";
    return undefined;
  }, [entry]);
  const cooldownLeftMs = Math.max(0, cooldownUntil - nowMs);
  const cooldownLeftSec = Math.ceil(cooldownLeftMs / 1000);
  const onCooldown = cooldownLeftMs > 0;

  return (
    <main className="mx-auto max-w-[720px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <SubViewHeader
        title={
          <>
            <Sword
              size={20}
              weight="duotone"
              className="text-amber-600 dark:text-amber-400"
            />
            아레나 전투
          </>
        }
        onBack={() => router.push("/battle/arena")}
      />

      {loadError && <LoadErrorBanner onRetry={loadEntry} />}

      {loading && (
        <div className="rounded-lg border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-500 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
          전투 기록을 불러오는 중...
        </div>
      )}

      {!loading && notFound && (
        <section className="rounded-lg border border-zinc-200 bg-white p-6 text-center shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
          <div className="text-sm font-semibold">전투 기록을 찾을 수 없어요.</div>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            보관 중인 최근 전투 기록만 다시 볼 수 있습니다.
          </p>
          <button
            type="button"
            onClick={() => router.push("/battle/arena")}
            className="mt-4 rounded-md bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-400"
          >
            아레나로 돌아가기
          </button>
        </section>
      )}

      {!loading && entry && (
        <>
          <section className="ui-arena-card rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                  <FilmStrip size={14} /> 전투 상세
                </div>
                <div className={"mt-1 text-2xl font-bold " + outcomeColor(entry.outcome)}>
                  {OUTCOME_LABEL[entry.outcome]}
                </div>
                <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                  vs{" "}
                  {entry.opponent.userId && entry.opponent.name ? (
                    <button
                      type="button"
                      onClick={() =>
                        router.push(
                          `/character/${encodeURIComponent(entry.opponent.name)}`,
                        )
                      }
                      className="font-semibold text-amber-700 underline decoration-dotted underline-offset-2 hover:text-amber-800 dark:text-amber-300"
                    >
                      {entry.opponent.name}
                    </button>
                  ) : (
                    <strong>{entry.opponent.name || "상대"}</strong>
                  )}
                  <span className="ml-1 text-zinc-500">
                    Lv.{entry.opponent.level ?? "?"}
                  </span>
                </div>
              </div>
              <div className="text-right text-xs text-zinc-500 dark:text-zinc-400">
                <div>{formatKst(entry.at)}</div>
                <div className="mt-1">{entry.turns}행동</div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <div className="rounded-md bg-zinc-50 p-3 dark:bg-zinc-800/70">
                <div className="flex items-center gap-1 text-xs text-zinc-500">
                  <Trophy size={12} /> 점수
                </div>
                <div className="mt-0.5 font-semibold tabular-nums">
                  {entry.scoreBefore} → {entry.scoreAfter}
                </div>
              </div>
              <div className="rounded-md bg-zinc-50 p-3 dark:bg-zinc-800/70">
                <div className="text-xs text-zinc-500">변동</div>
                <div className={"mt-0.5 font-semibold tabular-nums " + scoreColor(entry.scoreDelta)}>
                  {entry.scoreDelta >= 0 ? "+" : ""}
                  {entry.scoreDelta}
                </div>
              </div>
              <div className="rounded-md bg-zinc-50 p-3 dark:bg-zinc-800/70">
                <div className="flex items-center gap-1 text-xs text-zinc-500">
                  <Coin size={12} /> 골드
                </div>
                <div className="mt-0.5 font-semibold tabular-nums">
                  +{entry.goldGained.toLocaleString()}
                </div>
              </div>
            </div>
          </section>

          <ReplayBattleScene
            key={entry.id}
            payload={entry.replay}
            playerName={viewerName}
            gender={viewerGender}
            exp={0}
            maxExp={1}
            playerSubtitle={playerSubtitle}
            outcome={battleOutcome}
            outcomeAction={
              battleOutcome
                ? {
                    label: onCooldown
                      ? `재도전까지 ${cooldownLeftSec}초`
                      : "다음 전투 진행",
                    busyLabel: "매치 진행 중...",
                    busy: nextBusy,
                    disabled: onCooldown,
                    onClick: startNextMatch,
                    hint: nextError,
                  }
                : undefined
            }
          />
        </>
      )}
    </main>
  );
}
