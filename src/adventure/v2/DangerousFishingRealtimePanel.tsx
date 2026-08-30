"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import type {
  DangerousFishBehavior,
  DangerousRealtimeBaitEffect,
} from "@/adventure/data/v2/dangerousFishing";
import {
  DANGEROUS_REALTIME_LEGACY_BALANCE_REVISION,
  DANGEROUS_REALTIME_TICK_MS,
} from "./dangerousFishingRealtime";
import { DangerousFishingRealtimeCanvas } from "./DangerousFishingRealtimeCanvas";
import { DangerousFishingFeedbackCard } from "./DangerousFishingFeedbackCard";
import type { DangerousFishingFeedback } from "./dangerousFishingFeedback";
import {
  useDangerousFishingRealtime,
  type DangerousRealtimeClientEncounter,
  type DangerousRealtimeClientTarget,
  type DangerousRealtimeConnection,
  type DangerousRealtimeJsonReader,
} from "./useDangerousFishingRealtime";
import type { ActivityVerificationChallenge } from "./useActivityVerification";

type RealtimeScene = {
  encounterImageSrc: string;
  depth: "surface" | "midwater" | "deep";
  risk: number;
  description: string;
};

type RealtimeTargetMetadata = {
  imageSrc: string;
  struggleSpriteSrc?: string;
  name: string;
};

export type DangerousFishingRealtimePanelProps = {
  encounter: DangerousRealtimeClientEncounter;
  scene: RealtimeScene;
  targetMetadata: RealtimeTargetMetadata;
  endpointTarget: DangerousRealtimeClientTarget;
  readJson: DangerousRealtimeJsonReader;
  verification: ActivityVerificationChallenge | null;
  onFinish: (response: Record<string, unknown>) => void;
  feedback?: DangerousFishingFeedback | null;
  embedded?: boolean;
};

const CONNECTION_COPY = {
  online: "연결됨",
  syncing: "진행 저장 중",
  offline: "오프라인 · 입력을 기기에 보관 중",
  verification_required: "사람 확인 후 동기화 재개",
  finished: "결과 저장 완료",
} as const;

const BEHAVIOR_COPY: Record<DangerousFishBehavior, string> = {
  charge: "돌진",
  thrash: "몸부림",
  turn: "급선회",
  dive: "잠수",
};

function localResultCopy(
  status: Exclude<
    DangerousRealtimeClientEncounter["checkpoint"]["status"],
    "active"
  >,
  connection: DangerousRealtimeConnection,
): string {
  const delivery =
    connection === "finished"
      ? "서버 확인 완료"
      : connection === "syncing"
        ? "서버 확인 중"
        : connection === "offline"
          ? "오프라인 보관 · 재전송 필요"
          : "서버 확인 대기";
  const outcome =
    status === "caught"
      ? "어획 성공"
      : status === "line_broken"
        ? "조우 실패 · 낚싯줄 끊김"
        : status === "hook_lost"
          ? "조우 실패 · 바늘 빠짐"
          : "조우 실패 · 시간 종료";
  return `${outcome} · ${delivery}`;
}

function baitEffectCopy(effect: DangerousRealtimeBaitEffect): string {
  const effects: string[] = [];
  if (
    effect.turnDistanceRecoveryReductionPct > 0 ||
    effect.turnTensionImpactReductionPct > 0
  ) {
    const amount = Math.max(
      effect.turnDistanceRecoveryReductionPct,
      effect.turnTensionImpactReductionPct,
    );
    effects.push(`급선회 거리·장력 충격 ${amount}% 감소`);
  }
  if (effect.chargeAndThrashStaminaDamagePct > 0) {
    effects.push(
      `돌진·몸부림 어체력 피해 ${effect.chargeAndThrashStaminaDamagePct}% 증가`,
    );
  }
  if (effect.telegraphCount > 0) {
    effects.push(`다음 행동 ${effect.telegraphCount}개 예고`);
  }
  if (effect.diveSpeedReductionPct > 0) {
    effects.push(`잠수 속도 ${effect.diveSpeedReductionPct}% 감소`);
  }
  if (effect.startingStaminaReductionPct > 0) {
    effects.push(`시작 어체력 ${effect.startingStaminaReductionPct}% 감소`);
  }
  if (effect.tensionImpulseReductionPct > 0) {
    effects.push(`장력 충격 ${effect.tensionImpulseReductionPct}% 감소`);
  }
  return effects.length > 0 ? effects.join(" · ") : "없음";
}

function formatRemainingTime(remainingTicks: number): string {
  const totalSeconds = Math.max(
    0,
    Math.ceil((remainingTicks * DANGEROUS_REALTIME_TICK_MS) / 1_000),
  );
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function useReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);

  return reducedMotion;
}

function Meter({
  label,
  value,
  max,
  color,
  safeMin,
  safeMax,
  displayMax = max,
  visualMax = max,
  active = false,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  safeMin?: number;
  safeMax?: number;
  displayMax?: number;
  visualMax?: number;
  active?: boolean;
}) {
  const boundedMax = Math.max(1, max);
  const valuePct = Math.max(
    0,
    Math.min(100, (value / Math.max(1, visualMax)) * 100),
  );
  const safeStartPct = Math.max(
    0,
    Math.min(100, ((safeMin ?? 0) / boundedMax) * 100),
  );
  const safeEndPct = Math.max(
    safeStartPct,
    Math.min(100, ((safeMax ?? 0) / boundedMax) * 100),
  );

  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={`${value.toLocaleString()} / ${displayMax.toLocaleString()}`}
    >
      <div className="mb-1 flex items-center justify-between gap-2 text-xs font-medium">
        <span className="inline-flex items-center gap-1.5">
          {label}
          {active ? (
            <span className="rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-700 dark:bg-sky-950 dark:text-sky-300">
              조작 가능
            </span>
          ) : null}
        </span>
        <span>{value.toLocaleString()} / {displayMax.toLocaleString()}</span>
      </div>
      <div className="relative h-3 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
        {safeMin !== undefined && safeMax !== undefined ? (
          <span
            aria-hidden="true"
            className="absolute inset-y-0 bg-emerald-200 dark:bg-emerald-900"
            style={{
              left: `${safeStartPct}%`,
              width: `${safeEndPct - safeStartPct}%`,
            }}
          />
        ) : null}
        <span
          aria-hidden="true"
          className={`absolute inset-y-0 left-0 rounded-full ${color}`}
          style={{ width: `${valuePct}%` }}
        />
      </div>
      {safeMin !== undefined && safeMax !== undefined ? (
        <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
          안전 구간 {safeMin.toLocaleString()}–{safeMax.toLocaleString()}
        </p>
      ) : null}
    </div>
  );
}

export function DangerousFishingRealtimePanel({
  encounter,
  scene,
  targetMetadata,
  endpointTarget,
  readJson,
  verification,
  onFinish,
  feedback = null,
  embedded = false,
}: DangerousFishingRealtimePanelProps) {
  const realtime = useDangerousFishingRealtime({
    encounter,
    target: endpointTarget,
    readJson,
    verification,
    onFinish,
  });
  const reducedMotion = useReducedMotion();
  const { view } = realtime;
  const active = view.status === "active";
  const secured =
    encounter.balanceRevision !== DANGEROUS_REALTIME_LEGACY_BALANCE_REVISION &&
    active &&
    view.stamina === 0 &&
    view.distance === 0;
  const result = view.status === "active"
    ? null
    : localResultCopy(view.status, realtime.connection);
  const inputDisabled =
    !active ||
    realtime.startPending ||
    secured ||
    feedback?.terminal === true ||
    realtime.connection === "verification_required";
  const controlStatus = realtime.startPending
    ? "잠시 후 시작"
    : !active
      ? "조우 종료"
      : secured
        ? "포획 확보 · 인양 중"
        : realtime.holding
          ? "감아올리는 중"
          : inputDisabled
            ? "조작 대기 중"
            : "조작 가능 · 버튼을 누르면 감아올립니다";
  const controlLabel = realtime.startPending
    ? "조우 준비 중"
    : !active
      ? "조우 종료"
      : secured
        ? "포획 확보 · 자동 인양 중"
        : "누르고 감아올리기";
  const controlText = realtime.startPending
    ? "잠시 후 시작"
    : !active
      ? "조우 종료"
      : secured
        ? "최소 연출 시간까지 자동 인양 중"
        : realtime.holding
          ? "놓아서 줄 풀기"
          : "누르고 감아올리기";

  return (
    <section
      className={`${embedded ? "" : `${SURFACE_CARD} p-4`} space-y-4`}
      aria-label="실시간 위험 해역 조우"
    >
      <div className="overflow-hidden rounded-lg">
        <DangerousFishingRealtimeCanvas
          view={view}
          scene={scene}
          target={targetMetadata}
          reducedMotion={reducedMotion}
        />
      </div>

      {view.telegraphs.length > 0 ? (
        <div
          aria-label="행동 예고"
          aria-live="polite"
          className={`${SURFACE_INSET} flex flex-wrap items-center gap-x-4 gap-y-1 p-3 text-xs`}
        >
          {view.phase === "telegraph" ? (
            <span>
              <strong>현재 징후</strong> · {BEHAVIOR_COPY[view.telegraphs[0]]}
            </span>
          ) : null}
          {view.telegraphs.length > (view.phase === "telegraph" ? 1 : 0) ? (
            <span>
              <strong>다음 행동</strong> · {view.telegraphs
                .slice(view.phase === "telegraph" ? 1 : 0)
                .map((behavior) => BEHAVIOR_COPY[behavior])
                .join(" → ")}
            </span>
          ) : null}
        </div>
      ) : null}

      <div data-realtime-region="hud" className={`${SURFACE_INSET} space-y-3 p-3`}>
        <Meter
          label="낚싯줄 장력"
          value={view.tension}
          max={view.maxTension}
          safeMin={view.safeTensionMin}
          safeMax={view.safeTensionMax}
          color="bg-rose-500"
          active={!inputDisabled}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Meter
            label="어체력"
            value={view.stamina}
            max={view.maxStamina}
            color="bg-violet-500"
          />
          <Meter
            label="남은 거리"
            value={view.distance}
            max={view.startDistance * 2}
            displayMax={view.startDistance}
            visualMax={view.startDistance}
            color="bg-sky-500"
          />
        </div>
        <div className="grid gap-2 text-xs sm:grid-cols-2">
          <p role="timer" aria-label={`남은 시간 ${formatRemainingTime(view.remainingTicks)}`}>
            <strong>남은 시간</strong> · {formatRemainingTime(view.remainingTicks)}
          </p>
          <p>
            <strong>활성 미끼 효과</strong> · {baitEffectCopy(encounter.config.modifiers.baitEffect)}
          </p>
        </div>
      </div>

      <div
        data-realtime-region="status"
        role="status"
        aria-live="polite"
        className={`${SURFACE_INSET} flex flex-wrap items-center justify-between gap-2 p-3 text-xs`}
      >
        <span><strong>연결 상태</strong> · {CONNECTION_COPY[realtime.connection]}</span>
        <span>{controlStatus}</span>
      </div>

      {feedback ? (
        <DangerousFishingFeedbackCard feedback={feedback} />
      ) : result ? (
        <div data-realtime-region="result" role="status" aria-live="polite" className={`${SURFACE_CARD} p-3 text-center text-sm font-bold`}>
          {result}
          {realtime.connection === "offline" ? (
            <Button className="mt-2" onClick={realtime.retryFinish}>
              결과 전송 다시 시도
            </Button>
          ) : null}
        </div>
      ) : null}

      <div
        data-realtime-region="control"
        className={`${SURFACE_CARD} relative sticky bottom-[calc(env(safe-area-inset-bottom)+0.5rem)] z-20 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:pb-2`}
      >
        {realtime.warning && active && !secured ? (
          <p
            data-realtime-region="alert"
            role="alert"
            className={`${SURFACE_INSET} pointer-events-none absolute inset-x-0 bottom-[calc(100%+0.5rem)] border-amber-400 p-3 text-sm font-semibold text-amber-800 dark:border-amber-800 dark:text-amber-200`}
          >
            {realtime.warning}
          </p>
        ) : null}
        <Button
          fullWidth
          size="md"
          variant={realtime.holding && !secured ? "warning" : "info"}
          className={`min-h-16 touch-none select-none text-base ${
            inputDisabled
              ? ""
              : realtime.holding
                ? "ring-2 ring-amber-300 ring-offset-2 ring-offset-white dark:ring-amber-500 dark:ring-offset-zinc-900"
                : "ring-2 ring-sky-300 ring-offset-2 ring-offset-white dark:ring-sky-500 dark:ring-offset-zinc-900"
          }`}
          aria-label={controlLabel}
          aria-pressed={
            realtime.startPending || !active || secured ? false : realtime.holding
          }
          disabled={inputDisabled}
          onPointerDown={realtime.onPointerDown}
          onPointerUp={realtime.onPointerUp}
          onPointerCancel={realtime.onPointerUp}
          onLostPointerCapture={realtime.onPointerUp}
          onKeyDown={realtime.onKeyDown}
          onKeyUp={realtime.onKeyUp}
        >
          {controlText}
        </Button>
      </div>
    </section>
  );
}
