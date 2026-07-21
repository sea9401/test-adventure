"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SURFACE_INSET } from "@/components/ui/surfaces";

export type AutoGatheringSessionView = {
  sessionId: string;
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
};

function remainingLabel(readyAt: number, now: number): string {
  const remainingSeconds = Math.max(0, Math.ceil((readyAt - now) / 1_000));
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function AutoGatheringCard({
  activityName,
  spotId,
  session,
  result,
  loading,
  buttonVariant,
  onStart,
  onClaim,
}: {
  activityName: "벌목" | "채광";
  spotId: string;
  session: AutoGatheringSessionView | null;
  result: AutoGatheringResultView | null;
  loading: boolean;
  buttonVariant: "success" | "warning";
  onStart: (spotId: string) => Promise<void>;
  onClaim: () => Promise<void>;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const ready = Boolean(session && now >= session.readyAt);

  useEffect(() => {
    if (!session || ready) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [ready, session]);

  return (
    <Card padding="md" className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-extrabold">30분 자동 {activityName}</div>
          <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            재료 효율 80% · 경험치 효율 70% · 화면을 닫아도 진행
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-zinc-300 bg-zinc-50 px-2 py-1 text-[10px] font-bold text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
          30분
        </span>
      </div>

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

      <Button
        disabled={loading || Boolean(session && !ready)}
        onClick={() => {
          setError(null);
          void (session ? onClaim() : onStart(spotId)).catch(() => {
            setError(`자동 ${activityName}을 처리하지 못했습니다.`);
          });
        }}
        variant={buttonVariant}
        size="md"
        fullWidth
      >
        {loading
          ? "처리 중…"
          : session
            ? ready
              ? "자동 작업 보상 받기"
              : `자동 ${activityName} 진행 중`
            : `30분 자동 ${activityName} 시작`}
      </Button>
    </Card>
  );
}
