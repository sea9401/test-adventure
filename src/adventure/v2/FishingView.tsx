"use client";

import { FISH_TIERS, FISH_TOTAL, formatFishSize, type FishTier } from "@/adventure/data/v2/fish";
import { FISHING_SPOT_DIFFICULTY_LABEL, type FishingSpot } from "@/adventure/data/v2/fishingSpots";
import { MULTTAE_BY_ID, multtaeAt, type MulttaeConditionId } from "@/adventure/data/v2/multtae";
import { ActivityVerificationGate } from "./ActivityVerificationGate";
import type { AutoGatheringActivity } from "./autoGathering";
import { FishIcon } from "./FishIcon";
import { FishingResultScene, FishingSceneCanvas } from "./FishingCanvas";
import { FishingCatchItemIcon } from "./FishingCatchItemIcon";
import type { FishingProgressNotice } from "./fishingChallengeProgress";
import { FishingDailyCatchChecklist } from "./FishingDailyCatchChecklist";
import { triggerFishingBiteHaptic } from "./fishingHaptics";
import {
  FISHING_LURES,
  FISHING_RODS,
  fishingSizeBonusLabels,
  formatFishingBonusPercent,
  type FishingProgressionView,
} from "./fishingProgression";
import { fishingRewardSummaryLabels } from "./fishingRewardSummary";
import { REACTION_WINDOW_MS } from "./fishingSession";
import {
  fishingCatchItemChancePct,
  isFishingCatchItemId,
  type FishingCatchItemDailyProgress,
} from "./fishingStock";
import { FishingSubTabs } from "./FishingSubTabs";
import { GameIcon } from "./GameIcon";
import { LifeFieldEnvironmentCard } from "./LifeFieldPanels";
import { LifeLevelMilestoneNotice } from "./LifeLevelMilestoneNotice";
import { MulttaeBadge } from "./MulttaeBadge";
import { ProductionJobAdvanceNotice } from "./ProductionJobAdvanceNotice";
import {
  ActivityVerificationRequiredError,
  useActivityCooldown,
  type ActivityVerificationChallenge,
  type ActivityVerificationSubmission,
} from "./useActivityVerification";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import { useCallback, useEffect, useRef, useState } from "react";

// 완전 수동·반응형 낚시 미니게임 UI.
//
// 설계: docs/fishing-content-plan.md §2
// 표현/상호작용만 담당하고 서버 권위 판정은 주입된 cast/reel 콜백이 한다 —
// 실게임(useFishing)은 API 를, /dev 하니스는 로컬 mock 을 주입한다(로그인·DB 없이 QA).

export type FishingDailyCatchCoins = {
  earned: number;
  cap: number;
};


export type CastOutcome = {
  castId: string;
  biteDelayMs: number;
  dailyCatchCoins?: FishingDailyCatchCoins;
};


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
      /** 어종과 별도로 공동 식재료 보관함에 적립된 티어별 어획물. */
      catchItem?: {
        id: string;
        name: string;
        icon: string;
        quantity: number;
        balance: number;
        dailyAwarded: number;
        dailyCap: number;
      };
      catchItemStatus?: "awarded" | "roll_miss" | "daily_cap";
      catchItemDaily?: FishingCatchItemDailyProgress;
      /** 오늘 챔질로 획득한 낚시 코인 진행도. */
      dailyCatchCoins?: FishingDailyCatchCoins;
      /** 낚시 레벨 상승으로 받은 별도 낚시 코인 보상. */
      levelRewardCoins?: number;
      /** 성공한 챔질로 얻은 낚시 콘텐츠 진행 경험치. */
      fishingXpGained?: number;
      fishingLevel?: number;
      fishingLevelUp?: boolean;
      fishingCatches?: number;
      /** 이번 챔질로 오른 실제 낚시 직업 숙련도와 증가 후 누적값. */
      masteryGained?: number;
      masteryAfter?: number | null;
      /** 물때 한정 특별 손님이면 그 물때 정보(없으면 일반 어종). */
      special?: { id: string; label: string; emoji: string } | null;
      /** 서버 권위 연속 성공 기록과 현재 버프. */
      streak?: {
        current: number;
        best: number;
        buffTier: number;
        coinBonus: number;
      };
      hotTime?: {
        title: string;
        fishingCoinPct: number;
        catchBonus: number;
        levelBonus: number;
      } | null;
      /** 낚시 성공 중 낮은 확률로 소환된 협동 보스. */
      coopBoss?: {
        sessionId: string;
        kind: string;
        name: string;
        expiresAt: number;
      } | null;
      /** 이번 어획으로 오른 오늘의 의뢰/일일 과제/누적 목표. */
      challengeProgress?: FishingProgressNotice[];
      nextActionAt?: number | null;
    }
  | { caught: false; reason: string; nextActionAt?: number | null };


type CaughtReelOutcome = Extract<ReelOutcome, { caught: true }>;


export type FishingHandlers = {
  cast: () => Promise<CastOutcome>;
  reel: (castId: string, reactionMs: number) => Promise<ReelOutcome>;
  dailyCatchCoins?: FishingDailyCatchCoins | null;
  dailyCatchItems?: FishingCatchItemDailyProgress[] | null;
  progression?: FishingProgressionView | null;
  progressionLoading?: boolean;
  challengeBadgeCount?: number;
  fishingSpot?: FishingSpot;
  activeAutoActivity?: AutoGatheringActivity | null;
  verification?: ActivityVerificationChallenge | null;
  verifyHuman?: (submission: ActivityVerificationSubmission) => Promise<boolean>;
};


export type FishingPhase =
  | "idle"
  | "casting"
  | "waiting"
  | "biting"
  | "resolving"
  | "result";


export function isFishingActivePhase(phase: FishingPhase): boolean {
  return (
    phase === "casting" ||
    phase === "waiting" ||
    phase === "biting" ||
    phase === "resolving"
  );
}


export function fishingTapAction(
  phase: FishingPhase,
): "cast" | "reel" | null {
  if (phase === "idle" || phase === "result") return "cast";
  if (phase === "waiting" || phase === "biting") return "reel";
  return null;
}


function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return (
    target.isContentEditable ||
    tagName === "input" ||
    tagName === "select" ||
    tagName === "textarea" ||
    tagName === "button" ||
    tagName === "a"
  );
}


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


function FishingStatusStrip({
  dailyCatchCoins,
  dailyCoinPct,
  dailyCoinRemaining,
  sessionCount,
  sessionBest,
  streak,
  fishingSpot,
}: {
  dailyCatchCoins?: FishingDailyCatchCoins | null;
  dailyCoinPct: number;
  dailyCoinRemaining: number | null;
  sessionCount: number;
  sessionBest: number;
  streak: number;
  fishingSpot?: FishingSpot;
}) {
  return (
    <details className={`${SURFACE_INSET} group text-xs text-zinc-700 dark:text-zinc-200`}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2.5 py-2 [&::-webkit-details-marker]:hidden">
        <span className="font-semibold">낚시 정보</span>
        <span className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400">
          <span className="group-open:hidden">펼치기</span>
          <span className="hidden group-open:inline">접기</span>
        </span>
      </summary>
      <div className="border-t border-zinc-200 px-2.5 py-2 dark:border-zinc-700">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <div className="w-full min-w-0 sm:w-auto sm:flex-1">
            <MulttaeBadge compact />
          </div>
          {fishingSpot && (
            <span className="shrink-0 rounded border border-sky-300 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 dark:border-sky-800 dark:bg-sky-900 dark:text-sky-200">
              {FISHING_SPOT_DIFFICULTY_LABEL[fishingSpot.difficulty]}
            </span>
          )}
          {dailyCatchCoins && (
            <span className="shrink-0 font-medium tabular-nums text-amber-700 dark:text-amber-300">
              코인 {dailyCatchCoins.earned.toLocaleString()}/
              {dailyCatchCoins.cap.toLocaleString()}
            </span>
          )}
          {sessionCount > 0 && (
            <span className="shrink-0 text-[11px] text-zinc-500 dark:text-zinc-400">
              이번 판{" "}
              <b className="text-zinc-700 dark:text-zinc-200">{sessionCount}</b>
              마리
              {sessionBest > 0 && (
                <>
                  {" "}
                  · 최대{" "}
                  <b className="text-zinc-700 dark:text-zinc-200">
                    {formatFishSize(sessionBest)}
                  </b>
                </>
              )}
              {streak > 1 && (
                <b className="ml-1 text-amber-600 dark:text-amber-400">
                  연속 {streak}
                </b>
              )}
            </span>
          )}
        </div>
        {fishingSpot && (
          <div className="mt-0.5 truncate text-[10px] text-sky-700 dark:text-sky-300">
            {fishingSpot.description}
          </div>
        )}
        {dailyCatchCoins && (
          <>
            <div className="mt-1 flex items-center justify-between gap-3 text-[10px] text-amber-800/80 dark:text-amber-100/80">
              <span>
                {dailyCoinRemaining === 0
                  ? "일일 획득 제한 도달"
                  : dailyCoinRemaining == null
                    ? "일일 획득 제한 확인 중"
                    : `남은 ${dailyCoinRemaining.toLocaleString()} 코인`}
              </span>
              <span className="hidden sm:inline">제한 초과분 미지급</span>
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-amber-200/60 dark:bg-amber-950">
              <div
                className="h-full rounded-full bg-amber-500 transition-[width]"
                style={{ width: `${dailyCoinPct}%` }}
              />
            </div>
          </>
        )}
      </div>
    </details>
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
  common: { iconCls: "h-14 w-14", glow: false },
  uncommon: { iconCls: "h-16 w-16", glow: false },
  rare: { iconCls: "h-[4.5rem] w-[4.5rem]", glow: true },
  epic: { iconCls: "h-20 w-20", glow: true },
  legendary: { iconCls: "h-24 w-24", glow: true },
};


function levelBonusLabels(progression: FishingProgressionView): string[] {
  const bonuses = progression.levelBonuses;
  const labels = fishingSizeBonusLabels(bonuses);
  labels.push(
    `특별 손님 +${formatFishingBonusPercent(bonuses.specialWeightPct)}%`,
    `어획물 획득 ${fishingCatchItemChancePct(progression.level)}%`,
  );
  return labels;
}


function challengeProgressSummary(
  items: readonly FishingProgressNotice[] | undefined,
): string | null {
  if (!items || items.length === 0) return null;
  const completed = items.filter((item) => item.justCompleted).length;
  const claimable = items.filter((item) => item.claimable).length;
  return [
    `의뢰/목표 ${items.length}개 진행`,
    completed > 0 ? `${completed}개 완료` : null,
    claimable > 0 ? `${claimable}개 수령 가능` : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
}


function CatchRewardSummary({ result }: { result: CaughtReelOutcome }) {
  const labels = fishingRewardSummaryLabels(result);
  const catchItem =
    result.catchItem &&
    result.catchItem.quantity > 0 &&
    isFishingCatchItemId(result.catchItem.id)
      ? result.catchItem
      : null;
  const catchItemId =
    catchItem && isFishingCatchItemId(catchItem.id) ? catchItem.id : null;
  if (!catchItem && labels.length === 0) return null;
  return (
    <div className="flex flex-wrap justify-center gap-1.5 pt-1">
      {catchItem && catchItemId && (
        <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
          <FishingCatchItemIcon itemId={catchItemId} size={14} />
          {catchItem.name} +{catchItem.quantity} · 보유 {catchItem.balance} · 오늘{" "}
          {catchItem.dailyAwarded}/{catchItem.dailyCap}
        </span>
      )}
      {labels.map((label) => (
        <span
          key={label}
          className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
        >
          {label}
        </span>
      ))}
    </div>
  );
}


function ChallengeProgressSummary({
  items,
}: {
  items: readonly FishingProgressNotice[] | undefined;
}) {
  const summary = challengeProgressSummary(items);
  if (!summary) return null;
  return (
    <div className="mx-auto mt-2 max-w-sm rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-center text-[11px] font-medium text-amber-800 dark:border-amber-900/60 dark:bg-zinc-950 dark:text-amber-200">
      {summary}
    </div>
  );
}


function useCurrentMulttaeConditionId(): MulttaeConditionId {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  return multtaeAt(now).condition.id;
}


export function FishingView({
  cast,
  reel,
  dailyCatchCoins,
  dailyCatchItems,
  onBack,
  onOpenLeaderboard,
  onOpenDangerous,
  onOpenShop,
  onOpenChallenges,
  onOpenHallOfFame,
  onOpenCoopSession,
  onFishingActiveChange,
  progression,
  progressionLoading,
  challengeBadgeCount,
  fishingSpot,
  activeAutoActivity,
  verification,
  verifyHuman,
}: FishingHandlers & {
  onBack?: () => void;
  onOpenLeaderboard?: () => void;
  onOpenDangerous?: () => void;
  onOpenShop?: () => void;
  onOpenChallenges?: () => void;
  onOpenHallOfFame?: () => void;
  onOpenCoopSession?: (sessionId: string) => void;
  onFishingActiveChange?: (active: boolean) => void;
}) {
  const [phase, setPhase] = useState<FishingPhase>("idle");
  const [result, setResult] = useState<ReelOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 성공 시 결과에 보여줄 "입질→챔질" 반응시간(ms). 판정과 무관한 표시용.
  const [lastReactionMs, setLastReactionMs] = useState<number | null>(null);
  // 이번 판(세션) 기세 — 클라 표시뿐, 서버 저장·판정 무관.
  const [sessionCount, setSessionCount] = useState(0);
  const [sessionBest, setSessionBest] = useState(0);
  const [streak, setStreak] = useState(0);
  const [preBite, setPreBite] = useState(false);
  const [tapSignal, setTapSignal] = useState(0);
  const {
    applyNextActionAt,
    handleCooldownError,
    cooldownRemainingSec,
  } = useActivityCooldown();
  const currentTideId = useCurrentMulttaeConditionId();
  const activeAutoActivityName =
    activeAutoActivity === "woodcutting"
      ? "벌목"
      : activeAutoActivity === "mining"
        ? "채광"
        : null;

  const biteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preBiteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const windowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const biteShownAt = useRef<number>(0);
  const castId = useRef<string>("");
  // 한 캐스팅당 reel 1회 — 탭과 윈도우 타임아웃이 동시에 발생해도 이중 호출 방지.
  const resolved = useRef<boolean>(false);
  // 언마운트 후 async(cast/reel) resolve 가 죽은 컴포넌트에 타이머·setState 를 걸지 않도록.
  const mounted = useRef<boolean>(true);

  const clearTimers = useCallback(() => {
    if (biteTimer.current) clearTimeout(biteTimer.current);
    if (preBiteTimer.current) clearTimeout(preBiteTimer.current);
    if (windowTimer.current) clearTimeout(windowTimer.current);
    biteTimer.current = null;
    preBiteTimer.current = null;
    windowTimer.current = null;
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimers();
    };
  }, [clearTimers]);

  useEffect(() => {
    onFishingActiveChange?.(isFishingActivePhase(phase));
  }, [onFishingActiveChange, phase]);

  useEffect(
    () => () => {
      onFishingActiveChange?.(false);
    },
    [onFishingActiveChange],
  );

  const resolveReel = useCallback(
    async (reactionMs: number) => {
      if (resolved.current) return;
      resolved.current = true;
      clearTimers();
      setPreBite(false);
      setPhase("resolving");
      try {
        const outcome = await reel(castId.current, reactionMs);
        if (!mounted.current) return;
        applyNextActionAt(outcome.nextActionAt);
        if (outcome.caught) {
          setSessionCount((c) => c + 1);
          setSessionBest((b) => Math.max(b, outcome.size));
          setStreak((s) => outcome.streak?.current ?? s + 1);
          window.dispatchEvent(new Event("life-field:refresh"));
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
    [applyNextActionAt, reel, clearTimers],
  );

  const onBite = useCallback(() => {
    biteShownAt.current = Date.now();
    setPreBite(false);
    setPhase("biting");
    // 입질 햅틱 — 짧은 2회 패턴으로 모바일 진동 모터에서 인지되기 쉽게 한다.
    // 브라우저가 진동을 지원하지 않거나 권한 정책으로 거부해도 낚시 흐름은 그대로 진행한다.
    triggerFishingBiteHaptic();
    // 윈도우를 넘기면 자동 실패(여유를 약간 둬 네트워크 탭 지연 흡수).
    windowTimer.current = setTimeout(
      () => resolveReel(REACTION_WINDOW_MS + 500),
      REACTION_WINDOW_MS + 400,
    );
  }, [resolveReel]);

  const startCast = useCallback(async () => {
    if (cooldownRemainingSec > 0 || activeAutoActivity) return;
    setError(null);
    setResult(null);
    setLastReactionMs(null);
    setPreBite(false);
    resolved.current = false;
    setPhase("casting");
    try {
      const { castId: id, biteDelayMs } = await cast();
      if (!mounted.current) return;
      castId.current = id;
      setPhase("waiting");
      preBiteTimer.current = setTimeout(
        () => {
          if (mounted.current) setPreBite(true);
        },
        Math.max(0, biteDelayMs - 360),
      );
      biteTimer.current = setTimeout(onBite, biteDelayMs);
    } catch (caught) {
      if (!mounted.current) return;
      if (caught instanceof ActivityVerificationRequiredError) {
        setPhase("idle");
        return;
      }
      if (handleCooldownError(caught)) {
        setPhase("idle");
        return;
      }
      setError("찌를 던지지 못했다. 잠시 후 다시 시도해 보자.");
      setPhase("idle");
    }
  }, [activeAutoActivity, cast, cooldownRemainingSec, handleCooldownError, onBite]);

  // 중앙 탭 — 첫/재투척과 챔질 모두 엄지 위치를 옮기지 않고 처리한다.
  const onTapZone = useCallback(() => {
    const action = fishingTapAction(phase);
    if (action === "cast") {
      void startCast();
      return;
    }
    if (action !== "reel") return;

    setTapSignal((value) => value + 1);
    if (phase === "waiting") {
      // 입질 전 챔질 = 성급함. 서버가 too_early 로 판정하도록 reel 호출(세션 소비).
      resolveReel(-1);
    } else if (phase === "biting") {
      const rms = Date.now() - biteShownAt.current;
      setLastReactionMs(rms);
      resolveReel(rms);
    }
  }, [phase, resolveReel, startCast]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (verification) return;
      if (event.repeat || isTextEntryTarget(event.target)) return;
      if (event.key !== " " && event.key !== "Enter") return;

      if (
        (phase === "idle" || phase === "result") &&
        cooldownRemainingSec <= 0 &&
        !activeAutoActivity
      ) {
        event.preventDefault();
        startCast();
      } else if (phase === "waiting" || phase === "biting") {
        event.preventDefault();
        onTapZone();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeAutoActivity, cooldownRemainingSec, onTapZone, phase, startCast, verification]);

  const canStartCast = cooldownRemainingSec <= 0 && !activeAutoActivity;
  const tapAction = fishingTapAction(phase);
  const tapActive =
    tapAction === "reel" || (tapAction === "cast" && canStartCast);
  const biting = phase === "biting";
  const dailyCoinPct =
    dailyCatchCoins && dailyCatchCoins.cap > 0
      ? Math.min(
          100,
          Math.max(0, (dailyCatchCoins.earned / dailyCatchCoins.cap) * 100),
        )
      : 0;
  const dailyCoinRemaining =
    dailyCatchCoins && dailyCatchCoins.cap > 0
      ? Math.max(0, dailyCatchCoins.cap - dailyCatchCoins.earned)
      : null;
  const idleActionClass =
    "w-full rounded-xl bg-sky-600 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 active:scale-[0.99] sm:py-3";
  const resultActionClass =
    "fixed bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] left-1/2 z-50 w-[calc(100%-2rem)] max-w-[720px] -translate-x-1/2 rounded-xl bg-sky-600 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-950/20 transition hover:bg-sky-700 active:scale-[0.99]";

  return (
    <>
    <main className={`${SURFACE_CARD} mx-auto my-2 w-[calc(100%-1rem)] max-w-[720px] space-y-2.5 rounded-2xl p-3 text-zinc-900 shadow-lg dark:text-zinc-100 sm:my-4 sm:w-[calc(100%-2rem)] sm:space-y-3 sm:p-5`}>
        <SubViewHeader title={fishingSpot?.name ?? "낚시터"} onBack={onBack} />

        <ProductionJobAdvanceNotice refreshKey={progression?.catches ?? 0} />
        {progression ? (
          <LifeLevelMilestoneNotice
            activity="fishing"
            level={progression.level}
          />
        ) : null}

        {fishingSpot ? (
          <LifeFieldEnvironmentCard
            activity="fishing"
            spotId={fishingSpot.id}
          />
        ) : null}

        {verification && verifyHuman ? (
          <ActivityVerificationGate
            challenge={verification}
            onVerify={verifyHuman}
          />
        ) : null}

        <FishingSubTabs
          active="fishing"
          challengeBadgeCount={challengeBadgeCount}
          onOpenDangerous={onOpenDangerous}
          onOpenChallenges={onOpenChallenges}
          onOpenLeaderboard={onOpenLeaderboard}
          onOpenHallOfFame={onOpenHallOfFame}
          onOpenShop={onOpenShop}
        />

        <FishingStatusStrip
          dailyCatchCoins={dailyCatchCoins}
          dailyCoinPct={dailyCoinPct}
          dailyCoinRemaining={dailyCoinRemaining}
          sessionCount={sessionCount}
          sessionBest={sessionBest}
          streak={streak}
          fishingSpot={fishingSpot}
        />

        {dailyCatchItems && dailyCatchItems.length > 0 ? (
          <FishingDailyCatchChecklist items={dailyCatchItems} />
        ) : null}

        {progression ? (
          <>
            <div className="rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-[11px] dark:border-sky-900/60 dark:bg-zinc-950 sm:hidden">
              <div className="flex items-center gap-2">
                <span className="shrink-0 font-bold text-sky-900 dark:text-sky-100">
                  Lv {progression.level} / 100
                </span>
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-sky-100 dark:bg-sky-900">
                  <div
                    className="h-full rounded-full bg-sky-500 transition-[width]"
                    style={{
                      width: `${progression.xpForNext <= 0 ? 100 : Math.round(
                        (progression.xpIntoLevel / progression.xpForNext) * 100,
                      )}%`,
                    }}
                  />
                </div>
                <span className="shrink-0 font-medium text-sky-800 dark:text-sky-200">
                  크기 +{progression.levelBonuses.sizeBonusPct}%
                </span>
                <span className="shrink-0 font-medium text-sky-800 dark:text-sky-200">
                  손님 +{progression.levelBonuses.specialWeightPct}%
                </span>
              </div>
            </div>

            <div className="hidden rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs dark:border-sky-900/60 dark:bg-zinc-950 sm:block">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-sky-900 dark:text-sky-100">
                    낚시 Lv {progression.level} / 100
                  </div>
                  <div className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                    {progression.catches.toLocaleString()}마리 ·{" "}
                    {progression.xpForNext <= 0
                      ? "최종 숙련 달성 · MAX"
                      : `${progression.xpIntoLevel}/${progression.xpForNext} XP`}
                  </div>
                </div>
                <div className="min-w-0 text-right text-[11px] text-zinc-600 dark:text-zinc-300">
                  <div className="truncate">
                    {FISHING_RODS[progression.equippedRodId].name}
                  </div>
                  <div className="truncate">
                    {FISHING_LURES[progression.equippedLureId].name}
                  </div>
                </div>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sky-100 dark:bg-sky-900">
                <div
                  className="h-full rounded-full bg-sky-500 transition-[width]"
                  style={{
                    width: `${progression.xpForNext <= 0 ? 100 : Math.round(
                      (progression.xpIntoLevel / progression.xpForNext) * 100,
                    )}%`,
                  }}
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {levelBonusLabels(progression).map((label) => (
                  <span
                    key={label}
                    className="rounded bg-white/80 px-1.5 py-0.5 text-[10px] font-medium text-sky-800 dark:bg-sky-900/60 dark:text-sky-200"
                  >
                    숙련도 효과 · {label}
                  </span>
                ))}
              </div>
            </div>
          </>
        ) : progressionLoading ? (
          <div className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-center text-[11px] text-zinc-400 dark:border-zinc-700 sm:rounded-xl sm:p-3 sm:text-xs">
            낚시 숙련도 불러오는 중…
          </div>
        ) : null}

      {/* 탭 존 — 대기 중엔 찌가 잔잔히 까닥, 입질엔 확 빨려들며 떨린다.
          결과 화면(result)에선 숨김 — 그땐 아래 결과 박스가 본문이라 탭존은 빈 박스가 됨. */}
      {phase !== "result" && (
        <button
          type="button"
          disabled={!tapActive}
          onClick={onTapZone}
          aria-label={phase === "idle" ? "찌 던지기" : "챔질"}
          className={`ui-fishing-zone relative flex h-56 w-full touch-manipulation select-none flex-col items-center justify-center overflow-hidden rounded-lg border-2 text-center transition ${
            biting
              ? "is-biting border-rose-500 bg-rose-100 text-rose-950 ring-4 ring-rose-400/60 dark:border-rose-300 dark:bg-rose-950/70 dark:text-rose-100 dark:ring-rose-300/45"
              : tapActive
                ? "border-sky-300 bg-gradient-to-b from-sky-50 to-sky-100 text-sky-800 dark:border-sky-800 dark:from-sky-950/40 dark:to-sky-900/40 dark:text-sky-200"
                : "border-zinc-200 bg-zinc-50 text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-500"
          }`}
        >
          <FishingSceneCanvas
            phase={phase}
            preBite={preBite}
            tapSignal={tapSignal}
            tideId={currentTideId}
          />
        </button>
      )}

      {/* 결과 */}
      {phase === "result" && (
        <div className="ui-fishing-result relative rounded-xl border border-zinc-200 p-4 text-center dark:border-zinc-700">
          <button
            type="button"
            aria-label="다시 던지기"
            disabled={!canStartCast}
            onClick={onTapZone}
            className="absolute inset-0 z-10 touch-manipulation rounded-xl bg-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 disabled:cursor-not-allowed"
          />
          {error ? (
            <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
          ) : result?.caught ? (
            <div className="space-y-1">
              <div className="relative mx-auto flex h-24 w-full items-center justify-center overflow-hidden rounded-lg border border-sky-200 dark:border-sky-900/60">
                <FishingResultScene result={result} tideId={currentTideId} />
                {/* 희귀·대물 발광 */}
                {TIER_REVEAL[result.tier].glow && (
                  <span className="fish-glow absolute left-1/2 top-[46%] h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-300/35 blur-md" />
                )}
                <FishIcon
                  fishId={result.fishId}
                  name={result.name}
                  className={`fish-reveal relative z-10 -mt-2 drop-shadow-lg ${TIER_REVEAL[result.tier].iconCls}`}
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
                <div className="inline-flex items-center justify-center gap-1 text-[11px] font-medium text-sky-600 dark:text-sky-400">
                  <GameIcon
                    name={
                      MULTTAE_BY_ID.get(
                        result.special.id as MulttaeConditionId,
                      )?.iconName ?? "Fish"
                    }
                    size={14}
                  />
                  {result.special.label}의 특별한 손님
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
              <CatchRewardSummary result={result} />
              {result.coopBoss && (
                <div className="mt-3 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-left dark:border-rose-800 dark:bg-zinc-950">
                  <div className="text-sm font-semibold text-rose-800 dark:text-rose-200">
                    {result.coopBoss.name} 출현
                  </div>
                  <div className="mt-0.5 text-[11px] text-rose-700/80 dark:text-rose-200/80">
                    낚싯줄을 타고 협동 보스가 올라왔다.
                  </div>
                  {onOpenCoopSession && (
                    <button
                      type="button"
                      onClick={() => onOpenCoopSession(result.coopBoss!.sessionId)}
                      className="relative z-20 mt-2 w-full rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-700 active:scale-[0.99]"
                    >
                      토벌하러 가기
                    </button>
                  )}
                </div>
              )}
              <ChallengeProgressSummary items={result.challengeProgress} />
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
              <div className="relative mx-auto h-16 w-full overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700">
                <FishingResultScene result={result} tideId={currentTideId} />
                <FishIcon
                  fishId="minnow"
                  decorative
                  className="fish-dart-away absolute bottom-2 left-1/2 h-7 w-7"
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
        {phase === "idle" && !verification && (
          <button
            type="button"
            disabled={cooldownRemainingSec > 0 || Boolean(activeAutoActivity)}
            onClick={startCast}
            className={`${idleActionClass} disabled:cursor-not-allowed disabled:opacity-60`}
          >
            {activeAutoActivityName
              ? `자동 ${activeAutoActivityName} 진행 중`
              : cooldownRemainingSec > 0
              ? `다음 낚시까지 ${cooldownRemainingSec}초`
              : "찌 던지기"}
          </button>
        )}
        {phase === "result" && <div aria-hidden className="h-16" />}
      </main>

      {phase === "result" && !verification && (
        <button
          type="button"
          disabled={cooldownRemainingSec > 0 || Boolean(activeAutoActivity)}
          onClick={startCast}
          className={`${resultActionClass} disabled:cursor-not-allowed disabled:opacity-60`}
        >
          {activeAutoActivityName
            ? `자동 ${activeAutoActivityName} 진행 중`
            : cooldownRemainingSec > 0
            ? `다음 낚시까지 ${cooldownRemainingSec}초`
            : "다시 던지기"}
        </button>
      )}
    </>
  );
}
