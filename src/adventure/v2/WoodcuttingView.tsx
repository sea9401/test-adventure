"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Axe, TreeEvergreen } from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SubViewHeader } from "@/components/ui/SubViewHeader";

export type WoodcuttingSpot = "root" | "left" | "center" | "right";
export type WoodcuttingHitGrade = "perfect" | "good" | "clean" | "miss";

export type WoodcuttingRoundView = {
  index: number;
  total: number;
  weakSpot: WoodcuttingSpot;
  readyDelayMs: number;
  windowMs: number;
};

export type WoodcuttingHitView = {
  round: number;
  spot: WoodcuttingSpot;
  weakSpot: WoodcuttingSpot;
  reactionMs: number;
  grade: WoodcuttingHitGrade;
  score: number;
  reason: "ok" | "expired" | "too_early" | "missed_window" | "wrong_spot";
};

export type WoodcuttingLogView = {
  cuts: number;
  perfectCuts: number;
  timberEarned: number;
  bestReactionMs: number | null;
  bestCombo: number;
};

export type WoodcuttingTreeView = { id: string; name: string; tier: string };

export type WoodcuttingStart = {
  sessionId: string;
  tree: WoodcuttingTreeView;
  round: WoodcuttingRoundView;
};

export type WoodcuttingOutcome =
  | {
      complete: false;
      hit: WoodcuttingHitView;
      combo: number;
      bestCombo: number;
      round: WoodcuttingRoundView;
    }
  | {
      complete: true;
      success: true;
      tree: WoodcuttingTreeView;
      grade: "perfect" | "good" | "clean";
      timberGained: number;
      timber: number;
      hit: WoodcuttingHitView | null;
      hits: WoodcuttingHitView[];
      score: number;
      combo: number;
      bestCombo: number;
      log: WoodcuttingLogView;
    }
  | {
      complete: true;
      success: false;
      reason: string;
      tree: WoodcuttingTreeView | null;
      hit: WoodcuttingHitView | null;
      hits: WoodcuttingHitView[];
      score: number;
      combo: number;
      bestCombo: number;
      log: WoodcuttingLogView;
    };

export type WoodcuttingHandlers = {
  start: () => Promise<WoodcuttingStart>;
  chop: (
    sessionId: string,
    spot: WoodcuttingSpot,
    reactionMs: number,
  ) => Promise<WoodcuttingOutcome>;
  timber: number;
  log: WoodcuttingLogView;
};

type Phase = "idle" | "readying" | "strike" | "resolving" | "result";

const SPOT_LABEL: Record<WoodcuttingSpot, string> = {
  root: "밑동",
  left: "왼결",
  center: "속결",
  right: "오른결",
};

const SPOT_CLASS: Record<WoodcuttingSpot, string> = {
  root: "bottom-10 left-1/2 -translate-x-1/2",
  left: "bottom-28 left-[30%]",
  center: "bottom-36 left-1/2 -translate-x-1/2",
  right: "bottom-28 right-[30%]",
};

const MISS_MESSAGE: Record<string, string> = {
  too_early: "도끼가 너무 일찍 들어갔다.",
  missed_window: "박자가 지나갔다.",
  expired: "자세가 풀렸다.",
  wrong_spot: "약점이 아닌 결을 찍었다.",
  not_felled: "나무가 버텼다.",
  no_session: "벌목 자세가 풀렸다.",
  stale: "다른 벌목 작업이 먼저 진행됐다.",
};

function missMessage(reason: string): string {
  return MISS_MESSAGE[reason] ?? "나무를 제대로 베지 못했다.";
}

function gradeLabel(grade: WoodcuttingHitGrade | "perfect" | "good" | "clean"): string {
  if (grade === "perfect") return "완벽";
  if (grade === "good") return "좋음";
  if (grade === "clean") return "성공";
  return "실패";
}

function hitTone(hit: WoodcuttingHitView | null): string {
  if (!hit) return "text-zinc-500 dark:text-zinc-400";
  if (hit.grade === "perfect") return "text-emerald-600 dark:text-emerald-400";
  if (hit.grade === "good") return "text-sky-600 dark:text-sky-400";
  if (hit.grade === "clean") return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

function gradePips(hits: WoodcuttingHitView[], total: number) {
  return Array.from({ length: total }, (_, i) => {
    const hit = hits[i];
    const tone =
      hit?.grade === "perfect"
        ? "bg-emerald-500"
        : hit?.grade === "good"
          ? "bg-sky-500"
          : hit?.grade === "clean"
            ? "bg-amber-500"
            : hit
              ? "bg-rose-500"
              : "bg-zinc-300 dark:bg-zinc-700";
    return <span key={i} className={`h-2 flex-1 rounded ${tone}`} />;
  });
}

function WoodcuttingScene({
  phase,
  round,
  hits,
  lastHit,
  onSpot,
}: {
  phase: Phase;
  round: WoodcuttingRoundView | null;
  hits: WoodcuttingHitView[];
  lastHit: WoodcuttingHitView | null;
  onSpot: (spot: WoodcuttingSpot) => void;
}) {
  const active = phase === "readying" || phase === "strike";
  const strike = phase === "strike";
  return (
    <div
      className={`relative h-72 w-full overflow-hidden rounded-lg border-2 transition ${
        strike
          ? "border-amber-400 bg-amber-100 dark:bg-amber-950/50"
          : "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30"
      }`}
    >
      <div className="absolute inset-x-0 bottom-0 h-16 bg-emerald-900/15 dark:bg-emerald-300/10" />
      <div className="absolute bottom-12 left-1/2 h-40 w-16 -translate-x-1/2 rounded-t-[2rem] bg-[#76502f] shadow-lg">
        <div className="absolute left-1/2 top-5 h-28 w-2 -translate-x-1/2 rounded bg-[#a97443]/70" />
        <div className="absolute left-3 top-9 h-24 w-1 rounded bg-[#4a2f1b]/35" />
        <div className="absolute right-4 top-14 h-20 w-1 rounded bg-[#4a2f1b]/30" />
      </div>
      <div className="absolute bottom-[9.2rem] left-1/2 -translate-x-1/2">
        <TreeEvergreen
          size={148}
          weight="duotone"
          className={strike ? "text-amber-600" : "text-emerald-700 dark:text-emerald-400"}
        />
      </div>
      <div
        className={`absolute bottom-16 right-12 origin-bottom-left transition-transform duration-150 ${
          strike ? "-rotate-45 scale-110" : phase === "readying" ? "-rotate-12" : "rotate-6"
        }`}
      >
        <Axe size={62} weight="duotone" className="text-zinc-700 dark:text-zinc-100" />
      </div>

      {round &&
        (Object.keys(SPOT_LABEL) as WoodcuttingSpot[]).map((spot) => {
          const weak = spot === round.weakSpot;
          const selected = lastHit?.spot === spot && lastHit.round === round.index - 1;
          return (
            <button
              key={spot}
              type="button"
              disabled={!active}
              onClick={() => onSpot(spot)}
              className={`absolute ${SPOT_CLASS[spot]} grid h-14 w-14 place-items-center rounded-full border text-[11px] font-bold shadow-sm transition ${
                weak
                  ? strike
                    ? "border-amber-300 bg-amber-400 text-white shadow-[0_0_18px_rgba(251,191,36,0.75)]"
                    : "border-amber-300 bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100"
                  : "border-white/80 bg-white/85 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900/80 dark:text-zinc-200"
              } ${selected ? "ring-2 ring-zinc-900/20 dark:ring-white/30" : ""}`}
            >
              {SPOT_LABEL[spot]}
            </button>
          );
        })}

      <div className="absolute inset-x-4 top-4 flex items-center justify-between gap-2">
        <span className="rounded bg-white/80 px-3 py-1 text-xs font-bold text-zinc-700 shadow-sm dark:bg-zinc-900/80 dark:text-zinc-200">
          {round ? `${round.index}/${round.total}` : "대기"}
        </span>
        <span
          className={`rounded px-3 py-1 text-xs font-extrabold shadow-sm ${
            strike
              ? "bg-amber-500 text-white"
              : "bg-white/80 text-zinc-700 dark:bg-zinc-900/80 dark:text-zinc-200"
          }`}
        >
          {phase === "readying" ? "결 확인" : strike ? "지금" : phase === "resolving" ? "타격" : "준비"}
        </span>
      </div>

      <div className="absolute inset-x-4 bottom-4 flex gap-1">
        {gradePips(hits, round?.total ?? 3)}
      </div>
    </div>
  );
}

export function WoodcuttingView({
  start,
  chop,
  timber,
  log,
  onBack,
}: WoodcuttingHandlers & { onBack: () => void }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [tree, setTree] = useState<WoodcuttingTreeView | null>(null);
  const [round, setRound] = useState<WoodcuttingRoundView | null>(null);
  const [hits, setHits] = useState<WoodcuttingHitView[]>([]);
  const [lastHit, setLastHit] = useState<WoodcuttingHitView | null>(null);
  const [result, setResult] = useState<WoodcuttingOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const readyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expireTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readyShownAt = useRef(0);
  const sessionId = useRef("");
  const roundRef = useRef<WoodcuttingRoundView | null>(null);
  const resolveHitRef = useRef<(spot: WoodcuttingSpot, reactionMs: number) => void>(
    () => {},
  );
  const resolved = useRef(false);
  const mounted = useRef(true);

  const clearTimers = useCallback(() => {
    if (readyTimer.current) clearTimeout(readyTimer.current);
    if (expireTimer.current) clearTimeout(expireTimer.current);
    readyTimer.current = null;
    expireTimer.current = null;
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimers();
    };
  }, [clearTimers]);

  const scheduleRound = useCallback(
    (nextRound: WoodcuttingRoundView) => {
      roundRef.current = nextRound;
      setRound(nextRound);
      setPhase("readying");
      readyTimer.current = setTimeout(() => {
        readyShownAt.current = Date.now();
        setPhase("strike");
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate(25);
        }
        expireTimer.current = setTimeout(
          () => resolveHitRef.current(nextRound.weakSpot, nextRound.windowMs + 100),
          nextRound.windowMs + 150,
        );
      }, nextRound.readyDelayMs);
    },
    [],
  );

  const resolveHit = useCallback(
    async (spot: WoodcuttingSpot, reactionMs: number) => {
      if (resolved.current || !roundRef.current) return;
      resolved.current = true;
      clearTimers();
      setPhase("resolving");
      try {
        const outcome = await chop(sessionId.current, spot, reactionMs);
        if (!mounted.current) return;
        if (!outcome.complete) {
          setLastHit(outcome.hit);
          setHits((prev) => [...prev, outcome.hit]);
          resolved.current = false;
          scheduleRound(outcome.round);
          return;
        }
        setLastHit(outcome.hit);
        setHits(outcome.hits);
        roundRef.current = null;
        setResult(outcome);
        setPhase("result");
      } catch {
        if (!mounted.current) return;
        setError("벌목 처리 중 문제가 생겼다.");
        setPhase("result");
      }
    },
    [chop, clearTimers, scheduleRound],
  );

  useEffect(() => {
    resolveHitRef.current = (spot, reactionMs) => {
      void resolveHit(spot, reactionMs);
    };
  }, [resolveHit]);

  const startCut = useCallback(async () => {
    clearTimers();
    setError(null);
    setResult(null);
    setLastHit(null);
    setHits([]);
    setTree(null);
    roundRef.current = null;
    setRound(null);
    resolved.current = false;
    setPhase("readying");
    try {
      const s = await start();
      if (!mounted.current) return;
      sessionId.current = s.sessionId;
      setTree(s.tree);
      scheduleRound(s.round);
    } catch {
      if (!mounted.current) return;
      setError("벌목을 시작하지 못했다.");
      setPhase("idle");
    }
  }, [clearTimers, scheduleRound, start]);

  const onSpot = useCallback(
    (spot: WoodcuttingSpot) => {
      if (phase === "readying") {
        void resolveHit(spot, -1);
      } else if (phase === "strike") {
        void resolveHit(spot, Date.now() - readyShownAt.current);
      }
    },
    [phase, resolveHit],
  );

  const displayHits = useMemo(() => {
    if (phase === "result" && result?.complete) return result.hits;
    return hits;
  }, [hits, phase, result]);
  const activeResult = result?.complete ? result : null;

  return (
    <main className="mx-auto my-2 w-[calc(100%-1rem)] max-w-[560px] space-y-3 rounded-2xl border border-zinc-200 bg-white/90 p-3 text-zinc-900 shadow-lg backdrop-blur-md dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-zinc-100 sm:my-4 sm:w-[calc(100%-2rem)] sm:p-5">
      <SubViewHeader title="벌목장" onBack={onBack} />

      <div className="grid grid-cols-4 gap-2 text-center text-xs">
        <Card padding="sm">
          <div className="text-zinc-500 dark:text-zinc-400">통나무</div>
          <div className="mt-1 text-lg font-bold tabular-nums">{timber}</div>
        </Card>
        <Card padding="sm">
          <div className="text-zinc-500 dark:text-zinc-400">벌목</div>
          <div className="mt-1 text-lg font-bold tabular-nums">{log.cuts}</div>
        </Card>
        <Card padding="sm">
          <div className="text-zinc-500 dark:text-zinc-400">콤보</div>
          <div className="mt-1 text-lg font-bold tabular-nums">{log.bestCombo}</div>
        </Card>
        <Card padding="sm">
          <div className="text-zinc-500 dark:text-zinc-400">최고</div>
          <div className="mt-1 text-lg font-bold tabular-nums">
            {log.bestReactionMs == null
              ? "-"
              : `${(log.bestReactionMs / 1000).toFixed(2)}초`}
          </div>
        </Card>
      </div>

      {tree && (
        <div className="flex items-center justify-between rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800/80">
          <span className="font-bold">{tree.name}</span>
          <span className={`font-bold ${hitTone(lastHit)}`}>
            {lastHit ? gradeLabel(lastHit.grade) : "준비"}
          </span>
        </div>
      )}

      {phase !== "result" && (
        <WoodcuttingScene
          phase={phase}
          round={round}
          hits={displayHits}
          lastHit={lastHit}
          onSpot={onSpot}
        />
      )}

      {phase === "result" && (
        <Card padding="md" className="text-center">
          {error ? (
            <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
          ) : activeResult?.success ? (
            <div className="space-y-1">
              <div className="text-base font-bold">{activeResult.tree.name}</div>
              <div className="text-sm text-amber-600 dark:text-amber-400">
                통나무 +{activeResult.timberGained}
              </div>
              <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                {gradeLabel(activeResult.grade)} · {activeResult.score}점 · 최고 콤보{" "}
                {activeResult.bestCombo}
              </div>
            </div>
          ) : activeResult ? (
            <div className="space-y-1">
              <div className="text-base font-bold">
                {activeResult.tree?.name ?? "나무"}
              </div>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {missMessage(activeResult.reason)}
              </p>
              <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                {activeResult.score}점 · 최고 콤보 {activeResult.bestCombo}
              </div>
            </div>
          ) : null}
        </Card>
      )}

      {(phase === "idle" || phase === "result") && (
        <Button onClick={() => void startCut()} variant="success" size="md" fullWidth>
          {phase === "result" ? "다시 벌목" : "벌목 시작"}
        </Button>
      )}
    </main>
  );
}
