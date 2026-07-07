"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { timeAgoKo as timeAgo } from "@/lib/timeFormat";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { LoadErrorBanner } from "@/components/ui/LoadErrorBanner";
import { Pagination } from "@/components/ui/Pagination";
import { V2ArenaRankingTab } from "@/adventure/v2/V2ArenaRankingTab";
import { V2ArenaLoadoutTab } from "@/adventure/v2/V2ArenaLoadoutTab";
import { ArenaShopPanel } from "@/adventure/v2/ArenaShopPanel";
import type { ReplayPayload } from "@/adventure/data/v2/replayPayload";
import { usePagination } from "@/lib/usePagination";
import { Sword, Trophy, FilmStrip } from "@phosphor-icons/react";

// v2 1:1 아레나 — 5탭: 메인(도전·요약) / 전투 기록 / 순위표 / 세팅(로드아웃) / 상점.

type StateResp = {
  ok?: boolean;
  state?: {
    score: number;
    cooldownRemainingMs: number;
    season?: {
      id: string;
      startAt: string;
      endAt: string;
      rating: number;
      wins: number;
      losses: number;
      draws: number;
    };
  };
  cooldownMs?: number;
};

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

type ArenaSeasonHistoryEntry = {
  seasonId: string;
  startAt: string;
  endAt: string;
  rank: number;
  totalRanked: number;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
};

type ArenaOpponentRecord = {
  key: string;
  name: string;
  level: number;
  userId?: string;
  botId?: string;
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  lastAt: string;
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
      ranked: boolean;
      opponentScoreBefore: number;
      opponentScoreAfter: number;
      opponentScoreDelta: number;
      opponent: {
        name: string;
        level: number;
        score: number;
        userId?: string;
        botId?: string;
      };
      historyEntry: ArenaHistoryEntry;
      cooldownMs: number;
    }
  | {
      ok: false;
      error: string;
      cooldownMs?: number;
    };

type Tab = "main" | "history" | "ranking" | "loadout" | "shop";

const TABS: { id: Tab; label: string }[] = [
  { id: "main", label: "메인" },
  { id: "ranking", label: "순위표" },
  { id: "loadout", label: "전투 세팅" },
  { id: "history", label: "기록" },
  { id: "shop", label: "상점" },
];

// 서버가 cooldownMs 를 응답으로 주지만 누락 대비 클라 기본값(서버 ARENA_MATCH_COOLDOWN_MS 와 일치).
const FALLBACK_COOLDOWN_MS = 10_000;
const ARENA_HISTORY_PAGE_SIZE = 10;
const ARENA_HISTORY_CLIENT_MAX = 50;

const WEEKLY_REWARDS = [
  { rank: "1위", coins: 1000 },
  { rank: "2~3위", coins: 600 },
  { rank: "4~10위", coins: 300 },
  { rank: "참가", coins: 100 },
] as const;

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

function percent(numerator: number, denominator: number): string {
  if (denominator <= 0) return "0%";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function formatKst(iso: string | undefined): string {
  if (!iso) return "-";
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(time));
}

function recordText({
  wins,
  losses,
  draws,
}: {
  wins: number;
  losses: number;
  draws: number;
}): string {
  return `${wins}-${losses}-${draws}`;
}

function RecentBattleList({
  history,
  title,
  emptyText,
  onOpen,
}: {
  history: ArenaHistoryEntry[];
  title: string;
  emptyText: string;
  onOpen: (id: string) => void;
}) {
  const pager = usePagination(
    history,
    ARENA_HISTORY_PAGE_SIZE,
    history[0]?.id,
  );
  const rows = pager.pageItems;
  if (rows.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-zinc-500">{emptyText}</div>
    );
  }
  return (
    <section className="ui-arena-card rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-xs text-zinc-500 dark:text-zinc-400">
          {history.length.toLocaleString("ko-KR")}전
        </div>
      </div>
      <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {rows.map((h) => (
          <li key={h.id}>
            <button
              type="button"
              onClick={() => onOpen(h.id)}
              className="ui-guild-row flex w-full items-center gap-3 py-2 text-left text-sm transition hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
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
                {h.turns}행동
              </span>
              <span className="shrink-0 text-xs text-zinc-400">{timeAgo(h.at)}</span>
              <FilmStrip size={14} className="shrink-0 text-zinc-400" />
            </button>
          </li>
        ))}
      </ul>
      <Pagination
        page={pager.page}
        pageCount={pager.pageCount}
        setPage={pager.setPage}
      />
    </section>
  );
}

function WeeklySeasonRecords({
  seasons,
}: {
  seasons: ArenaSeasonHistoryEntry[];
}) {
  return (
    <section className="ui-arena-card rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <div className="mb-2 text-sm font-semibold">주간 아레나 기록</div>
      {seasons.length === 0 ? (
        <div className="py-5 text-center text-sm text-zinc-500">
          아직 종료된 주간 아레나 기록이 없어요.
        </div>
      ) : (
        <ul className="space-y-2">
          {seasons.map((s) => {
            const matches = s.wins + s.losses + s.draws;
            return (
              <li
                key={s.seasonId}
                className="rounded-md bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-800/70"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold">{s.seasonId}</span>
                  <span className="text-xs text-zinc-500">
                    {formatKst(s.endAt)} 종료
                  </span>
                </div>
                <div className="mt-1 grid grid-cols-3 gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                  <span>순위 {s.rank}/{s.totalRanked}</span>
                  <span>승률 {percent(s.wins, matches)}</span>
                  <span>전적 {recordText(s)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function OpponentRecords({
  records,
}: {
  records: ArenaOpponentRecord[];
}) {
  return (
    <section className="ui-arena-card rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <div className="mb-2 text-sm font-semibold">자주 만난 상대</div>
      {records.length === 0 ? (
        <div className="py-5 text-center text-sm text-zinc-500">
          아직 상대별 전적을 만들 기록이 부족해요.
        </div>
      ) : (
        <ul className="space-y-2">
          {records.map((r) => (
            <li
              key={r.key}
              className="flex items-center justify-between gap-3 rounded-md bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-800/70"
            >
              <span className="min-w-0">
                <span className="block truncate font-semibold">{r.name}</span>
                <span className="text-xs text-zinc-500">
                  Lv.{r.level} · {r.matches}전 · 최근 {timeAgo(r.lastAt)}
                </span>
              </span>
              <span className="shrink-0 text-right text-xs tabular-nums text-zinc-600 dark:text-zinc-300">
                <span className="block font-semibold">{recordText(r)}</span>
                <span>승률 {percent(r.wins, r.matches)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function V2ArenaView({ onBack }: { onBack: () => void }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("main");
  const [state, setState] = useState<StateResp | null>(null);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<ArenaHistoryEntry[]>([]);
  const [seasonHistory, setSeasonHistory] = useState<
    ArenaSeasonHistoryEntry[]
  >([]);
  const [opponentRecords, setOpponentRecords] = useState<
    ArenaOpponentRecord[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  // 재도전 쿨타임 — cooldownUntil(epoch ms, 0=없음). nowMs 틱으로 카운트다운 렌더.
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());

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
      // 새로고침 후에도 남은 쿨타임 이어서 표시.
      const rem = sj?.state?.cooldownRemainingMs ?? 0;
      if (rem > 0) {
        setNowMs(Date.now());
        setCooldownUntil(Date.now() + rem);
      }
      const hj = (await histRes.json().catch(() => null)) as {
        ok?: boolean;
        history?: ArenaHistoryEntry[];
        seasons?: ArenaSeasonHistoryEntry[];
        opponentRecords?: ArenaOpponentRecord[];
      } | null;
      if (hj?.ok) {
        if (Array.isArray(hj.history)) setHistory(hj.history);
        if (Array.isArray(hj.seasons)) setSeasonHistory(hj.seasons);
        if (Array.isArray(hj.opponentRecords)) {
          setOpponentRecords(hj.opponentRecords);
        }
      }
    } catch {
      setState(null);
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 1회 fetch
    loadState();
  }, [loadState]);

  // 쿨타임 카운트다운 틱 + 종료 시 자동 해제. cooldownUntil 변경 시 재설정.
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

  const challenge = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v2/arena/match", { method: "POST" });
      const j = (await res.json().catch(() => null)) as MatchResp | null;
      if (j && j.ok) {
        setHistory((prev) =>
          [j.historyEntry, ...prev].slice(0, ARENA_HISTORY_CLIENT_MAX),
        );
        setState((prev) =>
          prev?.state
            ? {
                ...prev,
                state: {
                  ...prev.state,
                  score: j.scoreAfter,
                  season: j.ranked && prev.state.season
                    ? {
                        ...prev.state.season,
                        rating: prev.state.season.rating + j.scoreDelta,
                        wins:
                          prev.state.season.wins +
                          (j.outcome === "win" ? 1 : 0),
                        losses:
                          prev.state.season.losses +
                          (j.outcome === "loss" ? 1 : 0),
                        draws:
                          prev.state.season.draws +
                          (j.outcome === "draw" ? 1 : 0),
                      }
                    : prev.state.season,
                },
              }
            : prev,
        );
        setNowMs(Date.now());
        setCooldownUntil(Date.now() + (j.cooldownMs ?? FALLBACK_COOLDOWN_MS));
        router.push(`/battle/arena/${encodeURIComponent(j.historyEntry.id)}`);
      } else if (j && !j.ok) {
        if (j.error === "cooldown") {
          setNowMs(Date.now());
          setCooldownUntil(Date.now() + (j.cooldownMs ?? FALLBACK_COOLDOWN_MS));
          setError("재도전 쿨타임이에요. 잠시 후 다시 도전해 주세요.");
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
  }, [busy, router]);

  const cooldownLeftMs = Math.max(0, cooldownUntil - nowMs);
  const onCooldown = cooldownLeftMs > 0;
  const cooldownLeftSec = Math.ceil(cooldownLeftMs / 1000);
  const canChallenge = !busy && !onCooldown;
  const season = state?.state?.season;
  const seasonMatches =
    (season?.wins ?? 0) + (season?.losses ?? 0) + (season?.draws ?? 0);
  const recent = history[0];

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
            아레나
          </>
        }
        onBack={onBack}
      />

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
          <section className="ui-arena-card rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <div className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                  <Trophy size={14} /> Elo 점수
                </div>
                <div className="mt-1 text-2xl font-bold tabular-nums">
                  {state?.state?.score ?? 0}
                </div>
              </div>
              <div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  이번 주 전적
                </div>
                <div className="mt-1 text-lg font-bold tabular-nums">
                  {season?.wins ?? 0}-{season?.losses ?? 0}-{season?.draws ?? 0}
                </div>
              </div>
              <div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">승률</div>
                <div className="mt-1 text-lg font-bold tabular-nums">
                  {percent(season?.wins ?? 0, seasonMatches)}
                </div>
              </div>
              <div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  주간 레이팅
                </div>
                <div className="mt-1 text-lg font-bold tabular-nums">
                  {season?.rating ?? 1000}
                </div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 pt-3 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              <span>시즌 {season?.id ?? "-"}</span>
              <span>정산 {formatKst(season?.endAt)}</span>
              {recent && (
                <span>
                  최근 {OUTCOME_LABEL[recent.outcome]} · {recent.scoreDelta >= 0 ? "+" : ""}
                  {recent.scoreDelta} · {timeAgo(recent.at)}
                </span>
              )}
            </div>
          </section>

          <button
            type="button"
            disabled={!canChallenge}
            onClick={challenge}
            className="ui-lift-card w-full rounded-lg bg-amber-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-zinc-400 dark:bg-amber-500 dark:hover:bg-amber-400 dark:disabled:bg-zinc-700"
          >
            {busy
              ? "매치 진행 중..."
              : onCooldown
                ? `재도전까지 ${cooldownLeftSec}초`
                : "도전"}
          </button>

          {error && (
            <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-950 dark:text-red-300">
              {error}
            </div>
          )}

          <section className="grid gap-3 sm:grid-cols-2">
            <div className="ui-arena-card rounded-lg border border-zinc-200 bg-white p-4 text-sm shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
              <div className="mb-2 font-semibold">규칙</div>
              <dl className="space-y-2 text-xs text-zinc-600 dark:text-zinc-300">
                <div className="flex justify-between gap-3">
                  <dt>매칭</dt>
                  <dd className="text-right">실유저 랭크 · 부족하면 연습 상대</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>쿨타임</dt>
                  <dd className="text-right">매치 후 10초</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>점수</dt>
                  <dd className="text-right">Elo K=32 · 승패 양쪽 정산</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>방어 기록</dt>
                  <dd className="text-right">상대가 나를 공격해도 점수/전적 반영</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>골드</dt>
                  <dd className="text-right">승리 Lv×50 · 패배/무승부 Lv×10</dd>
                </div>
              </dl>
            </div>

            <div className="ui-arena-card rounded-lg border border-zinc-200 bg-white p-4 text-sm shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="font-semibold">주간 보상</span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  우편함 지급
                </span>
              </div>
              <div className="space-y-1 text-xs">
                {WEEKLY_REWARDS.map((r) => (
                  <div
                    key={r.rank}
                    className="flex items-center justify-between rounded-md bg-zinc-50 px-2 py-1.5 dark:bg-zinc-800/70"
                  >
                    <span className="font-medium">{r.rank}</span>
                    <span className="tabular-nums text-amber-700 dark:text-amber-300">
                      {r.coins.toLocaleString()} 코인
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                주간 레이팅 순위 기준입니다. 매주 월요일 00:00(KST)에 시즌이 넘어갑니다.
              </p>
            </div>
          </section>

          <RecentBattleList
            history={history}
            title="최근 전투 기록"
            emptyText="아직 전투 기록이 없어요. 도전 후 기록이 여기에 표시됩니다."
            onOpen={(id) => router.push(`/battle/arena/${encodeURIComponent(id)}`)}
          />
        </>
      )}

      {tab === "history" && (
        <div className="space-y-3">
          <WeeklySeasonRecords seasons={seasonHistory} />
          <OpponentRecords records={opponentRecords} />
        </div>
      )}

      {tab === "ranking" && <V2ArenaRankingTab />}

      {tab === "loadout" && <V2ArenaLoadoutTab />}

      {tab === "shop" && <ArenaShopPanel />}
    </main>
  );
}
