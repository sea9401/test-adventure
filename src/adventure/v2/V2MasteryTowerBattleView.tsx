"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CastleTurret } from "@phosphor-icons/react";
import { ReplayBattleScene } from "@/adventure/v2/ReplayBattleScene";
import type { ReplayPayload } from "@/adventure/data/v2/replayPayload";
import { MASTERY_TOWER_MAX_FLOOR } from "@/adventure/data/v2/masteryTower";
import type { Gender } from "@/adventure/profile/avatars";
import { Card } from "@/components/ui/Card";
import { LoadErrorBanner } from "@/components/ui/LoadErrorBanner";
import { StatusBanner } from "@/components/ui/StatusBanner";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { useGameState } from "@/adventure/v2/GameStateProvider";
import type { StaminaState } from "@/adventure/v2/stamina";

type TowerLogEntry = {
  kind: "info" | "player" | "enemy" | "success" | "fail" | "reward";
  text: string;
};

type TowerAttemptResult = {
  ok?: boolean;
  success?: boolean;
  practice?: boolean;
  error?: string;
  tower?: {
    runFloor?: number;
    cooldownUntil?: number;
  };
  floor?: number | null;
  requiredPower?: number | null;
  power?: number;
  retryAfterSeconds?: number;
  log?: TowerLogEntry[];
  replay?: ReplayPayload;
  startPlayerHp?: number;
  playerName?: string;
  gender?: string;
  stamina?: StaminaState;
  staminaCost?: number;
  requiredStamina?: number;
  autoClaimedReward?: {
    total: number;
    previousDate: string;
    previousBestFloor: number;
  } | null;
};

export function masteryTowerResultMessage(
  result: TowerAttemptResult,
  cooldownSeconds: number,
): string {
  if (result.error === "max_floor") return "오늘 가능한 최고층에 도달했습니다.";
  if (result.error === "cooldown") {
    return result.practice
      ? `재입장 대기 중 · ${cooldownSeconds}초 후 50층 연습 재도전 가능`
      : `재입장 대기 중 · ${cooldownSeconds}초 후 시작 위치 선택 가능`;
  }
  if (result.practice && result.success) return "50층 연습 승리";
  if (result.success) return `${result.floor ?? "-"}층 돌파`;
  const retry =
    cooldownSeconds > 0
      ? result.practice
        ? ` · ${cooldownSeconds}초 후 연습 재도전 가능`
        : ` · ${cooldownSeconds}초 후 시작 위치 선택 가능`
      : "";
  const attemptLabel = result.practice
    ? `${result.floor ?? "-"}층 연습 실패`
    : `${result.floor ?? "-"}층 실패`;
  return `${attemptLabel} · 전투력 ${(result.power ?? 0).toLocaleString("ko-KR")}/${(result.requiredPower ?? 0).toLocaleString("ko-KR")}${retry}`;
}

export function canContinueMasteryTowerAttempt(
  result: TowerAttemptResult | null,
  busy: boolean,
  cooldownSeconds: number,
): boolean {
  if (!result?.ok || busy || result.error === "max_floor") return false;
  return Boolean(
    result.success || (result.practice === true && cooldownSeconds <= 0),
  );
}

function errorMessage(error: string | undefined): string {
  if (error === "unauthorized") return "로그인이 필요합니다.";
  if (error === "no_character") return "캐릭터가 없어 입장할 수 없습니다.";
  if (error === "fishing_job") return "낚시 계열 직업은 숙련의 탑에 입장할 수 없습니다.";
  if (error === "out_of_stamina") return "스태미나가 부족해 오늘 첫 입장을 진행할 수 없습니다.";
  if (error === "invalid_start_floor") return "선택한 시작 위치를 사용할 수 없습니다. 탑에서 다시 선택해 주세요.";
  return "입장을 진행할 수 없습니다. 잠시 후 다시 시도해 주세요.";
}

export function V2MasteryTowerBattleView({
  initialStartFloor,
}: {
  initialStartFloor?: number;
}) {
  const router = useRouter();
  const { setStamina } = useGameState();
  const [result, setResult] = useState<TowerAttemptResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const initialStartFloorRef = useRef(initialStartFloor);

  const enterTower = useCallback(async () => {
    setBusy(true);
    setLoadError(false);
    try {
      const res = await fetch("/api/v2/mastery-tower/attempt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          initialStartFloorRef.current == null
            ? {}
            : { startFloor: initialStartFloorRef.current },
        ),
      });
      const json = (await res.json().catch(() => null)) as TowerAttemptResult | null;
      if (!json) {
        setResult({ ok: false, error: `http ${res.status}` });
        setLoadError(true);
        return;
      }
      initialStartFloorRef.current = undefined;
      if (json.stamina) setStamina(json.stamina);
      setResult(json);
      setLoadError(!json.ok);
    } catch {
      setResult({ ok: false, error: "network" });
      setLoadError(true);
    } finally {
      setBusy(false);
    }
  }, [setStamina]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void enterTower();
    }, 0);
    return () => clearTimeout(timer);
  }, [enterTower]);

  const replay = useMemo(() => {
    if (!result?.replay || typeof result.floor !== "number") return null;
    return {
      floor: result.floor,
      payload: result.replay,
      startPlayerHp: result.startPlayerHp ?? result.replay.playerMaxHp,
      outcome: (result.success ? "win" : "lose") as "win" | "lose",
      playerName: result.playerName ?? "모험가",
      gender: (result.gender ?? "male1") as Gender,
    };
  }, [result]);

  const isMaxFloor = result?.error === "max_floor";
  const isPractice = result?.practice === true;
  const cooldownUntil =
    typeof result?.tower?.cooldownUntil === "number"
      ? result.tower.cooldownUntil
      : null;
  const cooldownSeconds =
    cooldownUntil && cooldownUntil > now
      ? Math.ceil((cooldownUntil - now) / 1000)
      : cooldownUntil
        ? 0
        : Math.max(0, Math.ceil(result?.retryAfterSeconds ?? 0));
  const isCooldown = cooldownSeconds > 0;
  const nextAttemptIsPractice = Boolean(
    isPractice ||
      (result?.success &&
        result.floor === MASTERY_TOWER_MAX_FLOOR &&
        result.tower?.runFloor === MASTERY_TOWER_MAX_FLOOR),
  );
  const canContinue = canContinueMasteryTowerAttempt(
    result,
    busy,
    cooldownSeconds,
  );

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

      {result && !result.ok && (
        <StatusBanner tone="error">{errorMessage(result.error)}</StatusBanner>
      )}

      {result?.autoClaimedReward && (
        <StatusBanner tone="success">
          전날 미수령 숙련 증서{" "}
          {result.autoClaimedReward.total.toLocaleString("ko-KR")}개가 자동
          지급되었습니다.
        </StatusBanner>
      )}

      {result?.ok && (
        <StatusBanner tone={result.success || isMaxFloor ? "success" : "error"}>
          {masteryTowerResultMessage(result, cooldownSeconds)}
        </StatusBanner>
      )}

      {isCooldown && (
        <StatusBanner tone="warning">
          {isPractice
            ? "50층 클리어 기록과 보상은 유지됩니다. 대기시간 뒤 같은 상대에게 다시 도전할 수 있습니다."
            : "패배하면 현재 등반은 초기화됩니다. 탑으로 돌아가 시작 위치를 다시 선택할 수 있습니다."}
        </StatusBanner>
      )}

      {result?.log && result.log.length > 0 && (
        <Card padding="md" className="space-y-3">
          <div className="flex items-center gap-2">
            <CastleTurret size={18} weight="duotone" className="text-emerald-500" />
            <h2 className="text-base font-semibold">도전 요약</h2>
          </div>
          <ol className="space-y-1.5">
            {result.log.map((entry, index) => (
              <li
                key={`${entry.kind}-${index}`}
                className={`rounded-md border px-3 py-2 text-sm ${logEntryClass(entry.kind)}`}
              >
                {entry.text}
              </li>
            ))}
          </ol>
        </Card>
      )}

      {replay && (
        <ReplayBattleScene
          key={`${replay.floor}-${replay.outcome}-${result?.power ?? 0}`}
          payload={replay.payload}
          startPlayerHp={replay.startPlayerHp}
          playerName={replay.playerName}
          gender={replay.gender}
          exp={0}
          maxExp={1}
          playerSubtitle={`숙련의 탑 ${replay.floor}층`}
          outcome={replay.outcome}
          outcomeAction={{
            label:
              nextAttemptIsPractice
                ? `${MASTERY_TOWER_MAX_FLOOR}층 연습 재도전`
                : replay.outcome === "win"
                ? "다음 층 입장"
                : "시작 위치 선택",
            busyLabel: "입장 중...",
            busy,
            disabled:
              nextAttemptIsPractice || replay.outcome === "win"
                ? !canContinue
                : false,
            onClick:
              nextAttemptIsPractice
                ? enterTower
                : replay.outcome === "win"
                  ? enterTower
                  : () => router.push("/battle/mastery-tower"),
          }}
        />
      )}

      {result?.ok && !replay && (
        <Card padding="md" className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => router.push("/battle/mastery-tower")}
            className="h-10 rounded-md bg-zinc-900 px-3 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
          >
            탑으로 돌아가기
          </button>
          <button
            type="button"
            onClick={() =>
              nextAttemptIsPractice || result.success
                ? void enterTower()
                : router.push("/battle/mastery-tower")
            }
            disabled={
              nextAttemptIsPractice || result.success ? !canContinue : false
            }
            className="h-10 rounded-md border border-zinc-200 px-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            {nextAttemptIsPractice
              ? `${MASTERY_TOWER_MAX_FLOOR}층 연습 재도전`
              : result.success
                ? "다음 층 입장"
                : "시작 위치 선택"}
          </button>
        </Card>
      )}
    </main>
  );
}

function logEntryClass(kind: TowerLogEntry["kind"]): string {
  if (kind === "success" || kind === "reward") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-200";
  }
  if (kind === "fail") {
    return "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-200";
  }
  if (kind === "player") {
    return "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/70 dark:bg-sky-950/30 dark:text-sky-200";
  }
  if (kind === "enemy") {
    return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200";
  }
  return "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200";
}
