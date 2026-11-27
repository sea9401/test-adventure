"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SURFACE_INSET } from "@/components/ui/surfaces";
import { confirmGameAction } from "@/components/ui/gameDialog";
import {
  AUTO_GATHERING_PLAN_LIST,
  autoGatheringDurationLabel,
  autoGatheringPlan,
  type AutoGatheringActivity,
  type AutoGatheringPlanId,
  type AutoGatheringSessionView,
} from "./autoGathering";
import {
  autoGatheringReservationLabel,
  type AutoGatheringReservation,
} from "./autoGatheringReservation";
import { diningXpBonusSuffix, type DiningXpBonus } from "./diningXpBonus";
import { masterProductGainText, type MasterProductGain } from "./masterProductGain";
import { sharedNetworkLimitMessage } from "./sharedNetworkLimit";

export type { AutoGatheringSessionView } from "./autoGathering";

export type AutoGatheringResultView = {
  attempts: number;
  successes: number;
  materialName: string;
  materialsGained: number;
  xpGained: number;
  byproducts?: Array<{
    materialId: string;
    name: string;
    amount: number;
  }>;
  masterProduct?: MasterProductGain | null;
  /** 식당 효과로 이번 정산에 붙은 경험치. 효과가 없으면 null. */
  diningXpBonus?: DiningXpBonus | null;
};

/** 보상을 받은 뒤 이어서 시작된 예약 작업. */
export type AutoGatheringChainView = {
  activity: AutoGatheringActivity;
  sourceName: string;
};

const ACTIVITY_LABEL: Record<AutoGatheringActivity, "벌목" | "채광"> = {
  woodcutting: "벌목",
  mining: "채광",
};
const ACTIVITY_HREF: Record<AutoGatheringActivity, string> = {
  woodcutting: "/town/logging",
  mining: "/town/mining",
};

function remainingLabel(readyAt: number, now: number): string {
  const remainingSeconds = Math.max(0, Math.ceil((readyAt - now) / 1_000));
  const hours = Math.floor(remainingSeconds / 3_600);
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes % 60).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function successRateAdjustmentLabel(multiplier: number): string {
  return multiplier === 1
    ? "성공률 보정 없음"
    : `기본 성공률의 ${multiplier * 100}%`;
}

export function AutoGatheringCard({
  activityName,
  spotId,
  extendedDurationMs,
  session,
  result,
  loading,
  blockedByActivity,
  buttonVariant,
  onStart,
  onClaim,
  onCancel,
  onRestart,
  spotName,
  reservation = null,
  reservationAllowed = false,
  chain = null,
  reservationDropped = false,
  onReserve,
  onUnreserve,
}: {
  activityName: "벌목" | "채광";
  spotId: string;
  /** 고른 채집지의 정비 단계에 따른 느긋한 작업 시간. 없으면 계획의 기본 시간이다. */
  extendedDurationMs?: number;
  session: AutoGatheringSessionView | null;
  result: AutoGatheringResultView | null;
  loading: boolean;
  blockedByActivity: AutoGatheringActivity | null;
  buttonVariant: "success" | "warning";
  onStart: (spotId: string, planId: AutoGatheringPlanId) => Promise<void>;
  onClaim: () => Promise<void>;
  onCancel: () => Promise<void>;
  /** 보상을 받고 같은 채집지에서 같은 작업을 다시 시작한다. 편의가 열렸을 때만 넘긴다. */
  onRestart?: () => Promise<void>;
  /** 고른 채집지 이름. 다음 작업 예약 줄에 쓴다. */
  spotName?: string;
  /** 걸어 둔 다음 작업. 벌목·채광 어느 쪽이든 하나다. */
  reservation?: AutoGatheringReservation | null;
  /** 지원권 이용 중이라 다음 작업을 예약할 수 있는지. */
  reservationAllowed?: boolean;
  chain?: AutoGatheringChainView | null;
  /** 예약한 작업을 시작하지 못하고 버렸을 때. */
  reservationDropped?: boolean;
  onReserve?: (spotId: string, planId: AutoGatheringPlanId) => Promise<void>;
  onUnreserve?: () => Promise<void>;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [planId, setPlanId] = useState<AutoGatheringPlanId>("standard");
  const [error, setError] = useState<string | null>(null);
  const ready = Boolean(session && now >= session.readyAt);
  const activePlan = autoGatheringPlan(session?.planId ?? planId);
  const planDurationLabel = (id: AutoGatheringPlanId) => {
    const plan = autoGatheringPlan(id);
    return autoGatheringDurationLabel(
      id === "extended" ? Math.max(plan.durationMs, extendedDurationMs ?? 0) : plan.durationMs,
    );
  };
  // 진행 중인 작업은 시작할 때 굳힌 시간을 쓴다. 그 뒤에 정비해도 길어지지 않는다.
  const activeDurationLabel = session
    ? autoGatheringDurationLabel(session.durationMs ?? activePlan.durationMs)
    : planDurationLabel(planId);
  const blockedActivityName =
    blockedByActivity === "woodcutting"
      ? "벌목"
      : blockedByActivity === "mining"
        ? "채광"
        : null;
  // 예약은 자동 채집이 이쪽이든 다른 쪽이든 돌고 있을 때만 뜻이 있다.
  const autoRunning = Boolean(session) || Boolean(blockedActivityName);
  const canReserve = reservationAllowed && Boolean(onReserve);
  const reserve = (id: AutoGatheringPlanId) => {
    if (!onReserve) return;
    setError(null);
    void onReserve(spotId, id).catch((caught: unknown) => {
      setError(sharedNetworkLimitMessage(caught) ?? "다음 작업을 예약하지 못했습니다.");
    });
  };

  useEffect(() => {
    if (!session || ready) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [ready, session]);

  return (
    <Card padding="md" className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-extrabold">
            {activeDurationLabel} 자동 {activityName}
          </div>
          <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            재료 효율 {activePlan.materialEfficiency * 100}% ·{" "}
            {successRateAdjustmentLabel(activePlan.successRateMultiplier)} · 경험치 효율{" "}
            {activePlan.xpEfficiency * 100}%
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-zinc-300 bg-zinc-50 px-2 py-1 text-[10px] font-bold text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
          {activeDurationLabel}
        </span>
      </div>

      {!session ? (
        <div className="grid grid-cols-2 gap-2" aria-label="자동 작업 시간 선택">
          {AUTO_GATHERING_PLAN_LIST.map((plan) => {
            const selected = plan.id === planId;
            return (
              <button
                key={plan.id}
                type="button"
                aria-pressed={selected}
                disabled={loading || (Boolean(blockedActivityName) && !canReserve)}
                onClick={() => setPlanId(plan.id)}
                className={`${SURFACE_INSET} rounded-md border p-2 text-left text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                  selected
                    ? "border-emerald-500 ring-1 ring-emerald-500"
                    : "border-zinc-200 hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-500"
                }`}
              >
                <span className="block font-bold">{planDurationLabel(plan.id)}</span>
                <span className="mt-0.5 block text-[10px] text-zinc-500 dark:text-zinc-400">
                  {plan.label} · 재료 {plan.materialEfficiency * 100}% ·{" "}
                  {successRateAdjustmentLabel(plan.successRateMultiplier)}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {session ? (
        <div className={`${SURFACE_INSET} p-3 text-xs`}>
          <div className="flex min-w-0 items-center justify-between gap-3">
            <span
              title={session.sourceName}
              className="min-w-0 truncate font-semibold"
            >
              {session.sourceName}
            </span>
            <span
              data-auto-gathering-time={ready ? "ready" : "remaining"}
              className="shrink-0 whitespace-nowrap font-bold tabular-nums"
            >
              {ready ? "정산 가능" : `남은 시간 ${remainingLabel(session.readyAt, now)}`}
            </span>
          </div>
          <div className="mt-1 text-zinc-500 dark:text-zinc-400">
            예상 작업 {session.attempts.toLocaleString()}회
          </div>
        </div>
      ) : null}

      {autoRunning && reservation ? (
        <div className={`${SURFACE_INSET} flex items-center justify-between gap-3 p-3 text-xs`}>
          <div className="min-w-0">
            <div className="text-zinc-500 dark:text-zinc-400">다음 작업 예약</div>
            <div className="truncate font-semibold">
              {autoGatheringReservationLabel(
                reservation,
                autoGatheringDurationLabel(reservation.durationMs),
              )}
            </div>
            {session && ready ? (
              <div className="mt-1 text-zinc-500 dark:text-zinc-400">
                보상을 받으면 앞 작업이 끝난 시각부터 이어서 계산합니다.
              </div>
            ) : null}
          </div>
          {onUnreserve ? (
            <Button
              disabled={loading}
              onClick={() => {
                setError(null);
                void onUnreserve().catch((caught: unknown) => {
                  setError(sharedNetworkLimitMessage(caught) ?? "예약을 취소하지 못했습니다.");
                });
              }}
              variant="ghost"
              size="sm"
              className="shrink-0"
            >
              예약 취소
            </Button>
          ) : null}
        </div>
      ) : null}

      {session && !reservation && canReserve ? (
        <div className={`${SURFACE_INSET} space-y-2 p-3 text-xs`}>
          <div>
            <div className="text-zinc-500 dark:text-zinc-400">다음 작업 예약</div>
            <div className="font-semibold">
              {spotName ?? "고른 채집지"}에서 자동 {activityName}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {AUTO_GATHERING_PLAN_LIST.map((plan) => (
              <Button
                key={plan.id}
                disabled={loading}
                onClick={() => reserve(plan.id)}
                variant="secondary"
                size="sm"
                fullWidth
              >
                {planDurationLabel(plan.id)} 예약
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      {autoRunning && !reservation && !reservationAllowed ? (
        <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
          다음 작업 예약은 월간 모험 지원권 이용 중에 쓸 수 있습니다.
        </p>
      ) : null}

      {result ? (
        <div className={`${SURFACE_INSET} p-3 text-center text-xs`}>
          <div className="font-bold">자동 {activityName} 정산 완료</div>
          <div className="mt-1 font-semibold">
            {result.materialName} +{result.materialsGained.toLocaleString()} · XP +
            {result.xpGained.toLocaleString()}
            {diningXpBonusSuffix(result.diningXpBonus)}
          </div>
          {result.byproducts && result.byproducts.length > 0 ? (
            <div className="mt-1 font-semibold text-amber-700 dark:text-amber-300">
              부산물 ·{" "}
              {result.byproducts
                .map(
                  (drop) =>
                    `${drop.name} +${drop.amount.toLocaleString()}`,
                )
                .join(" · ")}
            </div>
          ) : null}
          {result.masterProduct ? (
            <div className="mt-1 font-semibold text-amber-700 dark:text-amber-300">
              명장 산물 · {masterProductGainText(result.masterProduct)}
            </div>
          ) : null}
          <div className="mt-1 text-zinc-500 dark:text-zinc-400">
            {result.attempts.toLocaleString()}회 중 {result.successes.toLocaleString()}회 성공
          </div>
        </div>
      ) : null}

      {chain ? (
        <p className="text-center text-xs font-semibold">
          예약한 {ACTIVITY_LABEL[chain.activity]}({chain.sourceName})을 이어서 시작했습니다.
          {ACTIVITY_LABEL[chain.activity] !== activityName ? (
            <>
              {" "}
              <Link href={ACTIVITY_HREF[chain.activity]} className="underline">
                {ACTIVITY_LABEL[chain.activity]} 화면으로
              </Link>
            </>
          ) : null}
        </p>
      ) : null}

      {reservationDropped ? (
        <p className="text-center text-xs font-semibold text-amber-700 dark:text-amber-300">
          예약한 작업을 시작하지 못했습니다. 채집지를 골라 다시 시작해 주세요.
        </p>
      ) : null}

      {error ? (
        <p className="text-center text-xs font-semibold text-rose-600 dark:text-rose-400">
          {error}
        </p>
      ) : null}

      {!session && blockedActivityName ? (
        <p className="text-center text-xs font-semibold text-amber-700 dark:text-amber-300">
          {canReserve
            ? `자동 ${blockedActivityName}이 끝나면 이어서 시작합니다.`
            : `자동 ${blockedActivityName} 진행 중에는 다른 생활 활동을 시작할 수 없습니다.`}
        </p>
      ) : null}

      {session ? (
        <div className="space-y-2">
          <Button
            disabled={loading || !ready}
            onClick={() => {
              setError(null);
              void onClaim().catch((caught: unknown) => {
                setError(sharedNetworkLimitMessage(caught) ?? `자동 ${activityName} 보상을 받지 못했습니다.`);
              });
            }}
            variant={buttonVariant}
            size="md"
            fullWidth
          >
            {loading
              ? "처리 중…"
              : ready
                ? "자동 작업 보상 받기"
                : `자동 ${activityName} 진행 중`}
          </Button>
          {ready && onRestart ? (
            <Button
              disabled={loading}
              onClick={() => {
                setError(null);
                void onRestart().catch((caught: unknown) => {
                  setError(
                    sharedNetworkLimitMessage(caught) ??
                      `자동 ${activityName}을 다시 시작하지 못했습니다. 받은 보상은 정산되었는지 확인해 주세요.`,
                  );
                });
              }}
              variant="secondary"
              size="md"
              fullWidth
            >
              {reservation ? "보상 받고 다시 예약" : "보상 받고 다시 시작"}
            </Button>
          ) : null}
          {!ready ? (
            <Button
              disabled={loading}
              onClick={async () => {
                setError(null);
                if (
                  !(await confirmGameAction(
                    `자동 ${activityName}을 중단할까요? 지금까지 완료된 작업은 정산됩니다.`,
                  ))
                ) {
                  return;
                }
                void onCancel().catch((caught: unknown) => {
                  setError(sharedNetworkLimitMessage(caught) ?? `자동 ${activityName}을 중간 정산하지 못했습니다.`);
                });
              }}
              variant="danger"
              size="md"
              fullWidth
            >
              진행분 정산 후 중단
            </Button>
          ) : null}
        </div>
      ) : (
        <Button
          disabled={loading || (Boolean(blockedActivityName) && !canReserve)}
          onClick={() => {
            if (blockedActivityName) {
              reserve(planId);
              return;
            }
            setError(null);
            void onStart(spotId, planId).catch((caught: unknown) => {
              setError(sharedNetworkLimitMessage(caught) ?? `자동 ${activityName}을 시작하지 못했습니다.`);
            });
          }}
          variant={buttonVariant}
          size="md"
          fullWidth
        >
          {loading
            ? "처리 중…"
            : `${activeDurationLabel} 자동 ${activityName} ${
                blockedActivityName && canReserve ? "예약" : "시작"
              }`}
        </Button>
      )}
    </Card>
  );
}
