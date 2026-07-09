"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowClockwise,
  CastleTurret,
  CheckCircle,
  WarningCircle,
} from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { LoadErrorBanner } from "@/components/ui/LoadErrorBanner";
import { StatusBanner } from "@/components/ui/StatusBanner";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import type {
  TowerAttemptResult,
  TowerGimmick,
} from "./masteryTowerClientTypes";

function formatNumber(value: number | null | undefined): string {
  return (value ?? 0).toLocaleString("ko-KR");
}

function attemptMessage(result: TowerAttemptResult): string {
  if (result.error === "max_floor") return "오늘 가능한 최고층에 도달했습니다.";
  if (result.error === "cooldown") return "재입장 대기 중";
  if (result.success) {
    return result.encounter?.boss
      ? `${result.floor ?? "-"}층 ${result.encounter.boss.name} 격파`
      : `${result.floor ?? "-"}층 돌파`;
  }
  return `${result.floor ?? "-"}층 실패`;
}

function errorMessage(error: string | undefined): string {
  if (error === "unauthorized") return "로그인이 필요합니다.";
  if (error === "no_character") return "캐릭터가 없어 입장할 수 없습니다.";
  return "입장을 진행할 수 없습니다. 잠시 후 다시 시도해 주세요.";
}

export function V2MasteryTowerBattleView() {
  const router = useRouter();
  const [result, setResult] = useState<TowerAttemptResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const enterTower = useCallback(async () => {
    setBusy(true);
    setLoadError(false);
    try {
      const res = await fetch("/api/v2/mastery-tower/attempt", {
        method: "POST",
      });
      const json = (await res.json().catch(() => null)) as TowerAttemptResult | null;
      if (!json) {
        setResult({ ok: false, error: `http ${res.status}` });
        setLoadError(true);
        return;
      }
      setResult(json);
      setLoadError(!json.ok);
    } catch {
      setResult({ ok: false, error: "network" });
      setLoadError(true);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void enterTower();
    }, 0);
    return () => clearTimeout(timer);
  }, [enterTower]);

  const isMaxFloor = result?.error === "max_floor";
  const cooldownUntil =
    typeof result?.tower?.cooldownUntil === "number"
      ? result.tower.cooldownUntil
      : null;
  const cooldownSeconds =
    cooldownUntil && cooldownUntil > now
      ? Math.ceil((cooldownUntil - now) / 1000)
      : 0;
  const isCooldown = result?.error === "cooldown" || cooldownSeconds > 0;
  const isSuccess = Boolean(result?.ok && result.success);
  const isFailure = Boolean(result?.ok && result.success === false && !isMaxFloor);
  const canContinue = Boolean(result?.ok && !busy && !isMaxFloor && cooldownSeconds <= 0);

  useEffect(() => {
    if (!cooldownUntil || cooldownUntil <= now) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [cooldownUntil, now]);

  return (
    <main className="mx-auto max-w-[720px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <SubViewHeader
        title={
          <>
            <CastleTurret
              size={20}
              weight="duotone"
              className="text-emerald-600 dark:text-emerald-400"
            />
            숙련의 탑 전투
          </>
        }
        onBack={() => router.push("/battle/mastery-tower")}
      />

      {loadError && <LoadErrorBanner onRetry={enterTower} />}

      {busy && !result && (
        <Card padding="md" className="text-center text-sm text-zinc-500 dark:text-zinc-400">
          입장 중...
        </Card>
      )}

      {result && (
        <>
          {!result.ok ? (
            <StatusBanner tone="error">{errorMessage(result.error)}</StatusBanner>
          ) : (
            <StatusBanner tone={isFailure ? "error" : "success"}>
              {attemptMessage(result)}
              {isCooldown && cooldownSeconds > 0
                ? ` · ${cooldownSeconds}초 후 1층부터 재입장`
                : ""}
            </StatusBanner>
          )}

          <Card padding="md" className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                  {isFailure ? (
                    <WarningCircle size={14} />
                  ) : (
                    <CheckCircle size={14} />
                  )}
                  이번 입장
                </div>
                <h2
                  className={
                    "mt-1 text-2xl font-bold " +
                    (isFailure
                      ? "text-rose-600 dark:text-rose-400"
                      : "text-emerald-600 dark:text-emerald-400")
                  }
                >
                  {result.ok ? attemptMessage(result) : "입장 실패"}
                </h2>
              </div>
              {typeof result.floor === "number" && (
                <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-right dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">층</div>
                  <div className="text-lg font-semibold tabular-nums">
                    {result.floor}층
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
              <Stat label="내 전투력" value={formatNumber(result.power)} />
              <Stat label="권장 전투력" value={formatNumber(result.requiredPower)} />
              <Stat
                label="수령 예정"
                value={formatNumber(result.claimPreview?.total)}
              />
            </div>

            {isFailure && !isMaxFloor && (
              <StatusBanner tone="warning">
                패배하면 현재 등반은 초기화됩니다. 재입장 시 1층부터 다시 시작합니다.
                {cooldownSeconds > 0 ? ` 재입장 대기 ${cooldownSeconds}초.` : ""}
              </StatusBanner>
            )}

            {result.encounter?.boss && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200">
                <div className="font-semibold">
                  보스 층 · {result.encounter.boss.name}
                </div>
                <p className="mt-1 text-xs">{result.encounter.boss.description}</p>
                {result.encounter.gimmick && (
                  <BossGimmick gimmick={result.encounter.gimmick} />
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() =>
                  isMaxFloor
                  ? router.push("/battle/mastery-tower")
                  : void enterTower()
                }
                disabled={busy || (!canContinue && !isMaxFloor)}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-zinc-900 px-3 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
              >
                <ArrowClockwise size={16} />
                {busy
                  ? "진행 중..."
                  : isMaxFloor
                    ? "탑으로 돌아가기"
                    : cooldownSeconds > 0
                      ? `재입장 대기 ${cooldownSeconds}초`
                    : isSuccess
                      ? "다음 층 입장"
                      : "재입장"}
              </button>
              <button
                type="button"
                onClick={() => router.push("/battle/mastery-tower")}
                className="h-10 rounded-md border border-zinc-200 px-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-900"
              >
                나가기
              </button>
            </div>
          </Card>
        </>
      )}
    </main>
  );
}

function BossGimmick({ gimmick }: { gimmick: TowerGimmick }) {
  return (
    <div className="mt-2 border-t border-amber-200 pt-2 dark:border-amber-900/70">
      <div className="text-xs font-semibold">
        {gimmick.name}
        {gimmick.penaltyPercent > 0 ? ` · 요구 전투력 +${gimmick.penaltyPercent}%` : " · 파훼"}
      </div>
      <div className="mt-1 text-xs text-amber-700 dark:text-amber-300">
        {gimmick.description}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {gimmick.checks.map((check) => (
          <span
            key={check.id}
            className={
              check.passed
                ? "rounded border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
                : "rounded border border-amber-300 bg-white/70 px-1.5 py-0.5 text-[11px] text-amber-800 dark:border-amber-800 dark:bg-zinc-950/40 dark:text-amber-200"
            }
          >
            {check.label} {formatNumber(check.value)}/{formatNumber(check.target)}
          </span>
        ))}
      </div>
      <div className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">
        {gimmick.hint}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-xs text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className="mt-0.5 font-semibold tabular-nums">{value}</div>
    </div>
  );
}
