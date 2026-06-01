"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FISH_TIERS,
  formatFishSize,
  FISH_TOTAL,
  type FishTier,
} from "@/adventure/data/v2/fish";
import { REACTION_WINDOW_MS } from "@/adventure/v2/fishingSession";

// 완전 수동·반응형 낚시 미니게임 UI.
//
// 설계: docs/fishing-content-plan.md §2
// 표현/상호작용만 담당하고 서버 권위 판정은 주입된 cast/reel 콜백이 한다 —
// 실게임(useFishing)은 API 를, /dev 하니스는 로컬 mock 을 주입한다(로그인·DB 없이 QA).

export type CastOutcome = { castId: string; biteDelayMs: number };

export type ReelOutcome =
  | {
      caught: true;
      fishId: string;
      name: string;
      tier: FishTier;
      size: number;
      isNewSpecies: boolean;
      isPersonalBest: boolean;
      prevBest: number;
      codexCount: number;
    }
  | { caught: false; reason: string };

export type FishingHandlers = {
  cast: () => Promise<CastOutcome>;
  reel: (castId: string, reactionMs: number) => Promise<ReelOutcome>;
};

type Phase = "idle" | "casting" | "waiting" | "biting" | "resolving" | "result";

const MISS_MESSAGE: Record<string, string> = {
  too_early: "너무 일찍 챘다. 물고기가 달아났다.",
  missed_window: "입질을 놓쳤다. 한 발 늦었다.",
  expired: "타이밍을 놓쳐 줄을 놓쳤다.",
  no_session: "낚싯줄이 풀렸다. 다시 던져 보자.",
  stale: "다른 캐스팅이 진행 중이었다. 다시 던져 보자.",
};

function missMessage(reason: string): string {
  return MISS_MESSAGE[reason] ?? "물고기를 놓쳤다.";
}

export function FishingView({
  cast,
  reel,
  onBack,
  onOpenLeaderboard,
}: FishingHandlers & { onBack?: () => void; onOpenLeaderboard?: () => void }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<ReelOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);

  const biteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const windowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const biteShownAt = useRef<number>(0);
  const castId = useRef<string>("");
  // 한 캐스팅당 reel 1회 — 탭과 윈도우 타임아웃이 동시에 발생해도 이중 호출 방지.
  const resolved = useRef<boolean>(false);
  // 언마운트 후 async(cast/reel) resolve 가 죽은 컴포넌트에 타이머·setState 를 걸지 않도록.
  const mounted = useRef<boolean>(true);

  const clearTimers = useCallback(() => {
    if (biteTimer.current) clearTimeout(biteTimer.current);
    if (windowTimer.current) clearTimeout(windowTimer.current);
    biteTimer.current = null;
    windowTimer.current = null;
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimers();
    };
  }, [clearTimers]);

  const resolveReel = useCallback(
    async (reactionMs: number) => {
      if (resolved.current) return;
      resolved.current = true;
      clearTimers();
      setPhase("resolving");
      try {
        const outcome = await reel(castId.current, reactionMs);
        if (!mounted.current) return;
        setResult(outcome);
        setPhase("result");
      } catch {
        if (!mounted.current) return;
        setError("낚시 처리 중 문제가 생겼다.");
        setPhase("result");
      }
    },
    [reel, clearTimers],
  );

  const onBite = useCallback(() => {
    biteShownAt.current = Date.now();
    setPhase("biting");
    // 윈도우를 넘기면 자동 실패(여유를 약간 둬 네트워크 탭 지연 흡수).
    windowTimer.current = setTimeout(
      () => resolveReel(REACTION_WINDOW_MS + 500),
      REACTION_WINDOW_MS + 400,
    );
  }, [resolveReel]);

  const startCast = useCallback(async () => {
    setError(null);
    setResult(null);
    resolved.current = false;
    setPhase("casting");
    try {
      const { castId: id, biteDelayMs } = await cast();
      if (!mounted.current) return;
      castId.current = id;
      setPhase("waiting");
      biteTimer.current = setTimeout(onBite, biteDelayMs);
    } catch {
      if (!mounted.current) return;
      setError("찌를 던지지 못했다. 잠시 후 다시 시도해 보자.");
      setPhase("idle");
    }
  }, [cast, onBite]);

  // 큰 탭 존 클릭 — 단계에 따라 의미가 다르다.
  const onTapZone = useCallback(() => {
    if (phase === "waiting") {
      // 입질 전 챔질 = 성급함. 서버가 too_early 로 판정하도록 reel 호출(세션 소비).
      resolveReel(-1);
    } else if (phase === "biting") {
      resolveReel(Date.now() - biteShownAt.current);
    }
  }, [phase, resolveReel]);

  const tapActive = phase === "waiting" || phase === "biting";
  const biting = phase === "biting";

  return (
    <main className="mx-auto max-w-[520px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <header className="space-y-2 border-b border-zinc-200 pb-3 dark:border-zinc-800">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            ← 돌아가기
          </button>
        )}
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-lg font-bold">낚시터</h1>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              입질이 오면 곧바로 챔질하자. 잡은 물고기는 어보에 기록된다.
            </p>
          </div>
          {onOpenLeaderboard && (
            <button
              type="button"
              onClick={onOpenLeaderboard}
              className="shrink-0 rounded-full bg-zinc-200/70 px-3 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-300/70 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
            >
              주간 대회 순위
            </button>
          )}
        </div>
      </header>

      {/* 탭 존 — 대기 중엔 잔잔, 입질엔 번쩍. */}
      <button
        type="button"
        disabled={!tapActive}
        onClick={onTapZone}
        className={`flex h-48 w-full select-none flex-col items-center justify-center rounded-2xl border-2 text-center transition ${
          biting
            ? "animate-pulse border-amber-400 bg-amber-100 text-amber-900 dark:border-amber-500 dark:bg-amber-950/50 dark:text-amber-200"
            : tapActive
              ? "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200"
              : "border-zinc-200 bg-zinc-50 text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-500"
        }`}
      >
        {phase === "idle" && <span className="text-sm">찌를 던져 보자</span>}
        {phase === "casting" && <span className="text-sm">던지는 중…</span>}
        {phase === "waiting" && (
          <>
            <span className="text-3xl">🎣</span>
            <span className="mt-2 text-sm">입질을 기다리는 중…</span>
            <span className="mt-1 text-[11px] opacity-70">
              아직 누르지 말 것
            </span>
          </>
        )}
        {biting && (
          <>
            <span className="text-4xl">❗</span>
            <span className="mt-1 text-xl font-extrabold">지금 챔질!</span>
          </>
        )}
        {phase === "resolving" && <span className="text-sm">끌어올리는 중…</span>}
        {phase === "result" && <span className="text-sm opacity-70">—</span>}
      </button>

      {/* 결과 */}
      {phase === "result" && (
        <div className="rounded-xl border border-zinc-200 p-4 text-center dark:border-zinc-800">
          {error ? (
            <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
          ) : result?.caught ? (
            <div className="space-y-1">
              <div className="text-2xl">🐟</div>
              <div className="text-base font-bold">
                {result.name}{" "}
                <span className="text-amber-600 dark:text-amber-400">
                  {formatFishSize(result.size)}
                </span>
              </div>
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                {FISH_TIERS[result.tier].label}
              </div>
              <div className="flex flex-wrap justify-center gap-1.5 pt-1">
                {result.isNewSpecies && (
                  <span className="rounded bg-emerald-200/70 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200">
                    어보 신규 등록
                  </span>
                )}
                {!result.isNewSpecies && result.isPersonalBest && (
                  <span className="rounded bg-amber-200/80 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-900/60 dark:text-amber-200">
                    개인 최고 기록 갱신 (이전 {formatFishSize(result.prevBest)})
                  </span>
                )}
              </div>
              <div className="pt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
                어보 {result.codexCount}/{FISH_TOTAL}종
              </div>
            </div>
          ) : (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {missMessage(result?.reason ?? "")}
            </p>
          )}
        </div>
      )}

      {/* 액션 */}
      {(phase === "idle" || phase === "result") && (
        <button
          type="button"
          onClick={startCast}
          className="w-full rounded-xl bg-sky-600 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 active:scale-[0.99]"
        >
          {phase === "result" ? "다시 던지기" : "찌 던지기"}
        </button>
      )}
    </main>
  );
}
