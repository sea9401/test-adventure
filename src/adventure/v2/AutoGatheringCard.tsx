"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SURFACE_INSET } from "@/components/ui/surfaces";
import {
  AUTO_GATHERING_PLAN_LIST,
  autoGatheringPlan,
  type AutoGatheringActivity,
  type AutoGatheringPlanId,
} from "./autoGathering";

export type AutoGatheringSessionView = {
  sessionId: string;
  planId: AutoGatheringPlanId;
  sourceId: string;
  sourceName: string;
  materialId: string;
  startedAt: number;
  readyAt: number;
  attempts: number;
};

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

export function AutoGatheringCard({
  activityName,
  spotId,
  session,
  result,
  loading,
  blockedByActivity,
  buttonVariant,
  onStart,
  onClaim,
  onCancel,
}: {
  activityName: "벌목" | "채광";
  spotId: string;
  session: AutoGatheringSessionView | null;
  result: AutoGatheringResultView | null;
  loading: boolean;
  blockedByActivity: AutoGatheringActivity | null;
  buttonVariant: "success" | "warning";
  onStart: (spotId: string, planId: AutoGatheringPlanId) => Promise<void>;
  onClaim: () => Promise<void>;
  onCancel: () => Promise<void>;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [planId, setPlanId] = useState<AutoGatheringPlanId>("standard");
  const [error, setError] = useState<string | null>(null);
  const ready = Boolean(session && now >= session.readyAt);
  const activePlan = autoGatheringPlan(session?.planId ?? planId);
  const blockedActivityName =
    blockedByActivity === "woodcutting"
      ? "벌목"
      : blockedByActivity === "mining"
        ? "채광"
        : null;

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
            {activePlan.durationLabel} 자동 {activityName}
          </div>
          <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            재료 효율 {activePlan.materialEfficiency * 100}% · 성공률{" "}
            {activePlan.successRateMultiplier === 1
              ? "그대로"
              : `기존의 ${activePlan.successRateMultiplier * 100}%`} · 경험치 효율{" "}
            {activePlan.xpEfficiency * 100}%
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-zinc-300 bg-zinc-50 px-2 py-1 text-[10px] font-bold text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
          {activePlan.durationLabel}
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
                disabled={loading || Boolean(blockedActivityName)}
                onClick={() => setPlanId(plan.id)}
                className={`${SURFACE_INSET} rounded-md border p-2 text-left text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                  selected
                    ? "border-emerald-500 ring-1 ring-emerald-500"
                    : "border-zinc-200 hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-500"
                }`}
              >
                <span className="block font-bold">{plan.durationLabel}</span>
                <span className="mt-0.5 block text-[10px] text-zinc-500 dark:text-zinc-400">
                  {plan.label} · 재료 {plan.materialEfficiency * 100}% · 성공률{" "}
                  {plan.successRateMultiplier * 100}%
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {session ? (
        <div className={`${SURFACE_INSET} p-3 text-xs`}>
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold">{session.sourceName}</span>
            <span className="font-bold tabular-nums">
              {ready ? "정산 가능" : `남은 시간 ${remainingLabel(session.readyAt, now)}`}
            </span>
          </div>
          <div className="mt-1 text-zinc-500 dark:text-zinc-400">
            예상 작업 {session.attempts.toLocaleString()}회
          </div>
        </div>
      ) : result ? (
        <div className={`${SURFACE_INSET} p-3 text-center text-xs`}>
          <div className="font-bold">자동 {activityName} 정산 완료</div>
          <div className="mt-1 font-semibold">
            {result.materialName} +{result.materialsGained.toLocaleString()} · XP +
            {result.xpGained.toLocaleString()}
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
          <div className="mt-1 text-zinc-500 dark:text-zinc-400">
            {result.attempts.toLocaleString()}회 중 {result.successes.toLocaleString()}회 성공
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="text-center text-xs font-semibold text-rose-600 dark:text-rose-400">
          {error}
        </p>
      ) : null}

      {!session && blockedActivityName ? (
        <p className="text-center text-xs font-semibold text-amber-700 dark:text-amber-300">
          자동 {blockedActivityName} 진행 중에는 다른 생활 활동을 시작할 수 없습니다.
        </p>
      ) : null}

      {session ? (
        <div className="space-y-2">
          <Button
            disabled={loading || !ready}
            onClick={() => {
              setError(null);
              void onClaim().catch(() => {
                setError(`자동 ${activityName} 보상을 받지 못했습니다.`);
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
          {!ready ? (
            <Button
              disabled={loading}
              onClick={() => {
                setError(null);
                if (
                  !window.confirm(
                    `자동 ${activityName}을 중단할까요? 지금까지 완료된 작업은 정산됩니다.`,
                  )
                ) {
                  return;
                }
                void onCancel().catch(() => {
                  setError(`자동 ${activityName}을 중간 정산하지 못했습니다.`);
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
          disabled={loading || Boolean(blockedActivityName)}
          onClick={() => {
            setError(null);
            void onStart(spotId, planId).catch(() => {
              setError(`자동 ${activityName}을 시작하지 못했습니다.`);
            });
          }}
          variant={buttonVariant}
          size="md"
          fullWidth
        >
          {loading
            ? "처리 중…"
            : `${activePlan.durationLabel} 자동 ${activityName} 시작`}
        </Button>
      )}
    </Card>
  );
}
