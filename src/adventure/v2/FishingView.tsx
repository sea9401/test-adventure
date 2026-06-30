"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import {
  FISH_TIERS,
  formatFishSize,
  FISH_TOTAL,
  type FishTier,
} from "@/adventure/data/v2/fish";
import { REACTION_WINDOW_MS } from "@/adventure/v2/fishingSession";
import { MulttaeBadge } from "@/adventure/v2/MulttaeBadge";
import { FishingSubTabs } from "@/adventure/v2/FishingSubTabs";
import { FishIcon } from "@/adventure/v2/FishIcon";

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
      /** 이번 챔질로 받은 낚시 코인(티어 소량·일일 상한 도달 시 0). */
      coinsGained?: number;
      /** 물때 한정 특별 손님이면 그 물때 정보(없으면 일반 어종). */
      special?: { id: string; label: string; emoji: string } | null;
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

// 찌 연출 — 상태만 받아 그림을 그린다(판정·타이밍은 부모 그대로).
// waiting: 잔잔히 까닥 + 수면 잔물결·기포.  biting: 즉시 빨려들며 떨림 + 강한 물결.
function BobberScene({ phase }: { phase: Phase }) {
  const biting = phase === "biting";
  const waiting = phase === "waiting";
  const idle = phase === "idle";
  const onWater = waiting || biting;

  return (
    <div className="pointer-events-none relative flex h-full w-full flex-col items-center justify-center overflow-hidden">
      {/* ── 대기(idle) — 낚싯대·줄·찌가 놓인 조용한 수면 장면 ── */}
      {idle && (
        <div className="absolute inset-0">
          {/* 수면 밴드 */}
          <div className="absolute bottom-0 left-0 right-0 h-[38%] border-t border-blue-200/60 bg-blue-100/50 dark:border-blue-700/40 dark:bg-blue-900/30" />

          {/* 낚싯대 + 줄 (inline SVG) */}
          <svg
            aria-hidden="true"
            className="absolute inset-0 h-full w-full"
            viewBox="0 0 200 100"
            preserveAspectRatio="none"
          >
            {/* 낚싯대 팁 — 짧고 굵은 갈색 선 */}
            <line
              x1="170" y1="4"
              x2="148" y2="20"
              stroke="#8B6914"
              strokeWidth="3"
              strokeLinecap="round"
            />
            {/* 낚싯줄 — 얇은 회색 사선 */}
            <line
              x1="148" y1="20"
              x2="100" y2="60"
              stroke="#94a3b8"
              strokeWidth="0.8"
              strokeOpacity="0.7"
            />
          </svg>

          {/* 잔잔한 수면 잔물결 (느리고 작음 — 입질 신호와 명확히 구분) */}
          <span className="fish-ripple-calm absolute left-1/2 h-5 w-14 rounded-[100%] border border-blue-300/40 dark:border-blue-500/30" style={{ bottom: "37%" }} />
          <span
            className="fish-ripple-calm absolute left-1/2 h-5 w-14 rounded-[100%] border border-blue-300/25 dark:border-blue-500/20"
            style={{ bottom: "37%", animationDelay: "2.5s" }}
          />

          {/* 낚싯줄 빛 반사 글린트 */}
          <span
            className="fish-line-glint absolute h-1 w-1 rounded-full bg-white/70"
            style={{ left: "58%", top: "42%" }}
          />

          {/* 휴식 중인 찌 — 하늘색(=입질 신호인 amber와 색이 다름) */}
          <div className="absolute left-1/2 -translate-x-1/2" style={{ bottom: "calc(38% - 0.5rem)" }}>
            <div className="fish-bob-idle">
              <span className="mx-auto block h-3 w-[2px] rounded bg-zinc-400/70 dark:bg-zinc-500" />
              <span className="block h-4 w-4 rounded-full bg-sky-400 shadow-sm dark:bg-sky-500" />
              <span className="mx-auto -mt-1 block h-3 w-3 rounded-b-full rounded-t-sm bg-zinc-100 dark:bg-zinc-200" />
            </div>
          </div>
        </div>
      )}

      {/* ── waiting / biting — 기존 동작 그대로 ── */}
      {onWater && (
        <div className="relative flex h-20 w-full items-end justify-center">
          {/* 수면 잔물결 — 대기: 잔잔 다중, 입질: 강한 파동 */}
          <span
            className={`absolute bottom-3 left-1/2 h-6 w-16 rounded-[100%] border ${
              biting
                ? "fish-ripple-bite border-amber-400/70"
                : "fish-ripple border-sky-400/40"
            }`}
          />
          {waiting && (
            <>
              <span
                className="fish-ripple absolute bottom-3 left-1/2 h-6 w-16 rounded-[100%] border border-sky-400/30"
                style={{ animationDelay: "0.7s" }}
              />
              <span
                className="fish-ripple absolute bottom-3 left-1/2 h-6 w-16 rounded-[100%] border border-sky-400/20"
                style={{ animationDelay: "1.4s" }}
              />
              {/* 기포 */}
              <span className="fish-bubble absolute bottom-4 left-[42%] h-1.5 w-1.5 rounded-full bg-sky-300/60" />
              <span
                className="fish-bubble absolute bottom-4 left-[56%] h-1 w-1 rounded-full bg-sky-300/50"
                style={{ animationDelay: "1.6s" }}
              />
            </>
          )}

          {/* 찌 — 캐스팅 진입 시 포물선으로 날아와 안착(one-shot), 안에서 까닥/입질 */}
          <div className="fish-cast-arc relative z-10">
            <div className={biting ? "fish-bob-bite" : "fish-bob-idle"}>
              <span className="mx-auto block h-3 w-[2px] rounded bg-zinc-400/70 dark:bg-zinc-500" />
              <span
                className={`block h-4 w-4 rounded-full shadow-sm ${
                  biting ? "bg-amber-500" : "bg-rose-500"
                }`}
              />
              <span className="mx-auto -mt-1 block h-3 w-3 rounded-b-full rounded-t-sm bg-zinc-100 dark:bg-zinc-200" />
            </div>
          </div>
        </div>
      )}

      <div className="mt-2">
        {phase === "casting" && <span className="text-sm">던지는 중…</span>}
        {waiting && (
          <>
            <span className="block text-sm">입질을 기다리는 중…</span>
            <span className="mt-0.5 block text-[11px] opacity-70">
              아직 누르지 말 것
            </span>
          </>
        )}
        {biting && <span className="block text-xl font-extrabold">지금 챔질!</span>}
        {phase === "resolving" && <span className="text-sm">끌어올리는 중…</span>}
      </div>
    </div>
  );
}

// 반응속도 → 등급 라벨. 연출용일 뿐 보상·판정엔 영향 없음(공정성 유지).
function reactionGrade(ms: number): { label: string; cls: string } {
  if (ms < 250)
    return { label: "완벽!", cls: "text-emerald-600 dark:text-emerald-400" };
  if (ms < 450)
    return { label: "좋음", cls: "text-sky-600 dark:text-sky-400" };
  if (ms < 700)
    return { label: "무난", cls: "text-zinc-500 dark:text-zinc-400" };
  return { label: "아슬아슬", cls: "text-amber-600 dark:text-amber-400" };
}

// 티어별 "잡는 순간" 강조 — 희귀·대물일수록 크게 등장 + 발광.
const TIER_REVEAL: Record<FishTier, { iconCls: string; glow: boolean }> = {
  common: { iconCls: "h-12 w-12", glow: false },
  uncommon: { iconCls: "h-14 w-14", glow: false },
  rare: { iconCls: "h-16 w-16", glow: true },
  epic: { iconCls: "h-[4.5rem] w-[4.5rem]", glow: true },
  legendary: { iconCls: "h-20 w-20", glow: true },
};

export function FishingView({
  cast,
  reel,
  onBack,
  onOpenLeaderboard,
  onOpenShop,
  onOpenChallenges,
  onOpenHallOfFame,
}: FishingHandlers & {
  onBack?: () => void;
  onOpenLeaderboard?: () => void;
  onOpenShop?: () => void;
  onOpenChallenges?: () => void;
  onOpenHallOfFame?: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<ReelOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 성공 시 결과에 보여줄 "입질→챔질" 반응시간(ms). 판정과 무관한 표시용.
  const [lastReactionMs, setLastReactionMs] = useState<number | null>(null);
  // 이번 판(세션) 기세 — 클라 표시뿐, 서버 저장·판정 무관.
  const [sessionCount, setSessionCount] = useState(0);
  const [sessionBest, setSessionBest] = useState(0);
  const [streak, setStreak] = useState(0);

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
        if (outcome.caught) {
          setSessionCount((c) => c + 1);
          setSessionBest((b) => Math.max(b, outcome.size));
          setStreak((s) => s + 1);
        } else {
          setStreak(0);
        }
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
    // 입질 햅틱 — 모바일에서 진동으로 입질을 알림(시각 신호와 동시 발생, 정보 우위 없음).
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(35);
    }
    // 윈도우를 넘기면 자동 실패(여유를 약간 둬 네트워크 탭 지연 흡수).
    windowTimer.current = setTimeout(
      () => resolveReel(REACTION_WINDOW_MS + 500),
      REACTION_WINDOW_MS + 400,
    );
  }, [resolveReel]);

  const startCast = useCallback(async () => {
    setError(null);
    setResult(null);
    setLastReactionMs(null);
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
      const rms = Date.now() - biteShownAt.current;
      setLastReactionMs(rms);
      resolveReel(rms);
    }
  }, [phase, resolveReel]);

  const tapActive = phase === "waiting" || phase === "biting";
  const biting = phase === "biting";

  return (
    <main className="mx-auto my-4 w-[calc(100%-2rem)] max-w-[520px] space-y-4 rounded-2xl border border-zinc-200 bg-white/90 p-6 shadow-lg backdrop-blur-md text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900/90 dark:text-zinc-100">
      <SubViewHeader title="낚시터" onBack={onBack} />

      <FishingSubTabs
        active="fishing"
        onOpenChallenges={onOpenChallenges}
        onOpenLeaderboard={onOpenLeaderboard}
        onOpenHallOfFame={onOpenHallOfFame}
        onOpenShop={onOpenShop}
      />

      <MulttaeBadge />

      {sessionCount > 0 && (
        <div className="flex items-center justify-center gap-3 text-[11px] text-zinc-500 dark:text-zinc-400">
          <span>
            이번 판{" "}
            <b className="text-zinc-700 dark:text-zinc-200">{sessionCount}</b>마리
          </span>
          {sessionBest > 0 && (
            <span>
              최대{" "}
              <b className="text-zinc-700 dark:text-zinc-200">
                {formatFishSize(sessionBest)}
              </b>
            </span>
          )}
          {streak > 1 && (
            <span className="text-amber-600 dark:text-amber-400">
              🔥 연속 {streak}
            </span>
          )}
        </div>
      )}

      {/* 탭 존 — 대기 중엔 찌가 잔잔히 까닥, 입질엔 확 빨려들며 떨린다.
          결과 화면(result)에선 숨김 — 그땐 아래 결과 박스가 본문이라 탭존은 빈 박스가 됨. */}
      {phase !== "result" && (
        <button
          type="button"
          disabled={!tapActive}
          onClick={onTapZone}
          className={`ui-fishing-zone relative flex h-48 w-full select-none flex-col items-center justify-center overflow-hidden rounded-2xl border-2 text-center transition ${
            biting
              ? "border-amber-400 bg-amber-100 text-amber-900 dark:border-amber-500 dark:bg-amber-950/50 dark:text-amber-200"
              : tapActive
                ? "border-sky-300 bg-gradient-to-b from-sky-50 to-sky-100 text-sky-800 dark:border-sky-800 dark:from-sky-950/40 dark:to-sky-900/40 dark:text-sky-200"
                : "border-zinc-200 bg-zinc-50 text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-500"
          }`}
        >
          <BobberScene phase={phase} />
        </button>
      )}

      {/* 결과 */}
      {phase === "result" && (
        <div className="ui-fishing-result rounded-xl border border-zinc-200 p-4 text-center dark:border-zinc-800">
          {error ? (
            <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
          ) : result?.caught ? (
            <div className="space-y-1">
              <div className="relative mx-auto flex h-20 w-full items-center justify-center">
                {/* 물보라 — 한 번 퍼지고 사라짐 */}
                <span className="fish-splash absolute bottom-1 left-1/2 h-9 w-20 rounded-[100%] border-2 border-sky-400/50" />
                {/* 희귀·대물 발광 */}
                {TIER_REVEAL[result.tier].glow && (
                  <span className="fish-glow absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-300/40 blur-md" />
                )}
                <FishIcon
                  fishId={result.fishId}
                  name={result.name}
                  className={`fish-reveal ${TIER_REVEAL[result.tier].iconCls}`}
                />
              </div>
              <div className="text-base font-bold">
                {result.name}{" "}
                <span className="text-amber-600 dark:text-amber-400">
                  {formatFishSize(result.size)}
                </span>
              </div>
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                {FISH_TIERS[result.tier].label}
              </div>
              {result.special && (
                <div className="text-[11px] font-medium text-sky-600 dark:text-sky-400">
                  {result.special.emoji} {result.special.label}의 특별한 손님
                </div>
              )}
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
              {result.coinsGained != null && result.coinsGained > 0 && (
                <div className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
                  + {result.coinsGained} 낚시 코인
                </div>
              )}
              {lastReactionMs != null && (
                <div className="text-[11px] font-medium">
                  <span className={reactionGrade(lastReactionMs).cls}>
                    {reactionGrade(lastReactionMs).label}
                  </span>{" "}
                  <span className="text-zinc-500 dark:text-zinc-400">
                    {(lastReactionMs / 1000).toFixed(2)}초 만에 챔질!
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              {/* 놓침 — 물고기가 휙 달아난다 */}
              <div className="relative mx-auto h-8 w-full overflow-hidden">
                <FishIcon
                  fishId="minnow"
                  decorative
                  className="fish-dart-away absolute bottom-0 left-1/2 h-8 w-8"
                />
              </div>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {missMessage(result?.reason ?? "")}
              </p>
            </div>
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
