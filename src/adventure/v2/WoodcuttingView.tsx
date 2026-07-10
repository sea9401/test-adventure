"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Axe, TreeEvergreen } from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { CHOP_REACTION_WINDOW_MS } from "@/adventure/v2/woodcuttingSession";

export type WoodcuttingLogView = {
  cuts: number;
  perfectCuts: number;
  timberEarned: number;
  bestReactionMs: number | null;
};

export type WoodcuttingStart = { sessionId: string; readyDelayMs: number };

export type WoodcuttingOutcome =
  | {
      success: true;
      tree: { id: string; name: string; tier: string };
      grade: "perfect" | "good" | "clean";
      timberGained: number;
      timber: number;
      log: WoodcuttingLogView;
    }
  | { success: false; reason: string };

export type WoodcuttingHandlers = {
  start: () => Promise<WoodcuttingStart>;
  chop: (sessionId: string, reactionMs: number) => Promise<WoodcuttingOutcome>;
  timber: number;
  log: WoodcuttingLogView;
};

type Phase = "idle" | "readying" | "strike" | "resolving" | "result";

const MISS_MESSAGE: Record<string, string> = {
  too_early: "결을 보지 못하고 도끼가 빗나갔다.",
  missed_window: "좋은 결이 지나가 나무껍질만 긁었다.",
  expired: "힘을 싣는 타이밍을 놓쳤다.",
  no_session: "벌목 자세가 풀렸다. 다시 잡아 보자.",
  stale: "다른 벌목 작업이 먼저 진행됐다.",
};

function missMessage(reason: string): string {
  return MISS_MESSAGE[reason] ?? "나무를 제대로 베지 못했다.";
}

function gradeLabel(grade: "perfect" | "good" | "clean"): string {
  if (grade === "perfect") return "완벽한 벌목";
  if (grade === "good") return "깔끔한 벌목";
  return "성공";
}

function reactionTone(ms: number | null): string {
  if (ms == null) return "";
  if (ms <= 220) return "text-emerald-600 dark:text-emerald-400";
  if (ms <= 480) return "text-sky-600 dark:text-sky-400";
  return "text-amber-600 dark:text-amber-400";
}

function WoodcuttingScene({ phase }: { phase: Phase }) {
  const strike = phase === "strike";
  const readying = phase === "readying";
  return (
    <div
      className={`relative h-full w-full overflow-hidden rounded-md ${
        strike
          ? "bg-amber-100 dark:bg-amber-950/50"
          : "bg-emerald-50 dark:bg-emerald-950/30"
      }`}
    >
      <div className="absolute inset-x-0 bottom-0 h-16 bg-emerald-900/15 dark:bg-emerald-300/10" />
      <div className="absolute left-5 top-7 h-24 w-10 rounded-full bg-emerald-700/20 blur-lg" />
      <div className="absolute right-10 top-5 h-28 w-12 rounded-full bg-teal-700/20 blur-lg" />

      <div className="absolute bottom-11 left-1/2 h-32 w-12 -translate-x-1/2 rounded-t-[2rem] bg-[#7a5633] shadow-lg">
        <div className="absolute left-1/2 top-5 h-24 w-2 -translate-x-1/2 rounded bg-[#a97443]/70" />
        <div
          className={`absolute left-1/2 top-11 h-12 w-20 -translate-x-1/2 rounded-full border-2 ${
            strike
              ? "border-amber-400 bg-amber-200/80 shadow-[0_0_18px_rgba(251,191,36,0.75)]"
              : "border-emerald-900/20 bg-emerald-700/10"
          }`}
        />
      </div>

      <div
        className={`absolute bottom-[8.25rem] left-1/2 -translate-x-1/2 ${
          strike ? "scale-105" : readying ? "animate-pulse" : ""
        }`}
      >
        <TreeEvergreen
          size={156}
          weight="duotone"
          className={
            strike
              ? "text-amber-600"
              : "text-emerald-700 dark:text-emerald-400"
          }
        />
      </div>

      <div
        className={`absolute bottom-16 right-14 origin-bottom-left transition-transform duration-150 ${
          strike ? "-rotate-45 scale-110" : readying ? "-rotate-12" : "rotate-6"
        }`}
      >
        <Axe size={64} weight="duotone" className="text-zinc-700 dark:text-zinc-100" />
      </div>

      <div className="absolute inset-x-4 top-4 text-center">
        {phase === "idle" && (
          <span className="rounded bg-white/75 px-3 py-1 text-sm font-medium text-emerald-900 shadow-sm dark:bg-zinc-900/75 dark:text-emerald-100">
            벌목 준비
          </span>
        )}
        {phase === "readying" && (
          <span className="rounded bg-white/75 px-3 py-1 text-sm font-medium text-zinc-700 shadow-sm dark:bg-zinc-900/75 dark:text-zinc-200">
            나무결을 보는 중
          </span>
        )}
        {strike && (
          <span className="rounded bg-amber-500 px-3 py-1 text-xl font-extrabold text-white shadow-sm">
            지금 찍기
          </span>
        )}
        {phase === "resolving" && (
          <span className="rounded bg-white/75 px-3 py-1 text-sm font-medium text-zinc-700 shadow-sm dark:bg-zinc-900/75 dark:text-zinc-200">
            가르는 중
          </span>
        )}
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
  const [result, setResult] = useState<WoodcuttingOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastReactionMs, setLastReactionMs] = useState<number | null>(null);
  const readyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expireTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readyShownAt = useRef(0);
  const sessionId = useRef("");
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

  const resolveChop = useCallback(
    async (reactionMs: number) => {
      if (resolved.current) return;
      resolved.current = true;
      clearTimers();
      setPhase("resolving");
      try {
        const outcome = await chop(sessionId.current, reactionMs);
        if (!mounted.current) return;
        setResult(outcome);
        setPhase("result");
      } catch {
        if (!mounted.current) return;
        setError("벌목 처리 중 문제가 생겼다.");
        setPhase("result");
      }
    },
    [chop, clearTimers],
  );

  const onReady = useCallback(() => {
    readyShownAt.current = Date.now();
    setPhase("strike");
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(30);
    }
    expireTimer.current = setTimeout(
      () => resolveChop(CHOP_REACTION_WINDOW_MS + 500),
      CHOP_REACTION_WINDOW_MS + 350,
    );
  }, [resolveChop]);

  const startCut = useCallback(async () => {
    setError(null);
    setResult(null);
    setLastReactionMs(null);
    resolved.current = false;
    setPhase("readying");
    try {
      const s = await start();
      if (!mounted.current) return;
      sessionId.current = s.sessionId;
      readyTimer.current = setTimeout(onReady, s.readyDelayMs);
    } catch {
      if (!mounted.current) return;
      setError("벌목을 시작하지 못했다.");
      setPhase("idle");
    }
  }, [start, onReady]);

  const onTapZone = useCallback(() => {
    if (phase === "readying") {
      resolveChop(-1);
    } else if (phase === "strike") {
      const ms = Date.now() - readyShownAt.current;
      setLastReactionMs(ms);
      resolveChop(ms);
    }
  }, [phase, resolveChop]);

  const active = phase === "readying" || phase === "strike";

  return (
    <main className="mx-auto my-2 w-[calc(100%-1rem)] max-w-[520px] space-y-3 rounded-2xl border border-zinc-200 bg-white/90 p-3 text-zinc-900 shadow-lg backdrop-blur-md dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-zinc-100 sm:my-4 sm:w-[calc(100%-2rem)] sm:p-5">
      <SubViewHeader title="벌목장" onBack={onBack} />

      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <Card padding="sm">
          <div className="text-zinc-500 dark:text-zinc-400">통나무</div>
          <div className="mt-1 text-lg font-bold tabular-nums">{timber}</div>
        </Card>
        <Card padding="sm">
          <div className="text-zinc-500 dark:text-zinc-400">성공</div>
          <div className="mt-1 text-lg font-bold tabular-nums">{log.cuts}</div>
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

      {phase !== "result" && (
        <button
          type="button"
          disabled={!active}
          onClick={onTapZone}
          className={`relative h-64 w-full select-none overflow-hidden rounded-lg border-2 transition ${
            phase === "strike"
              ? "border-amber-400"
              : active
                ? "border-emerald-300 dark:border-emerald-800"
                : "border-zinc-200 dark:border-zinc-700"
          }`}
        >
          <WoodcuttingScene phase={phase} />
        </button>
      )}

      {phase === "result" && (
        <Card padding="md" className="text-center">
          {error ? (
            <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
          ) : result?.success ? (
            <div className="space-y-1">
              <div className="text-base font-bold">{result.tree.name}</div>
              <div className="text-sm text-amber-600 dark:text-amber-400">
                통나무 +{result.timberGained}
              </div>
              <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                {gradeLabel(result.grade)}
              </div>
              {lastReactionMs != null && (
                <div className={`text-xs font-medium ${reactionTone(lastReactionMs)}`}>
                  {(lastReactionMs / 1000).toFixed(2)}초
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {missMessage(result?.reason ?? "")}
            </p>
          )}
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
