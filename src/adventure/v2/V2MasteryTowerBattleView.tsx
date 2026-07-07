"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CastleTurret } from "@phosphor-icons/react";
import { ReplayBattleScene } from "@/adventure/v2/ReplayBattleScene";
import type { ReplayPayload } from "@/adventure/data/v2/replayPayload";
import type { Gender } from "@/adventure/profile/avatars";
import { Card } from "@/components/ui/Card";
import { LoadErrorBanner } from "@/components/ui/LoadErrorBanner";
import { StatusBanner } from "@/components/ui/StatusBanner";
import { SubViewHeader } from "@/components/ui/SubViewHeader";

type TowerLogEntry = {
  kind: "info" | "player" | "enemy" | "success" | "fail" | "reward";
  text: string;
};

type TowerAttemptResult = {
  ok?: boolean;
  success?: boolean;
  error?: string;
  floor?: number | null;
  requiredPower?: number | null;
  power?: number;
  log?: TowerLogEntry[];
  replay?: ReplayPayload;
  startPlayerHp?: number;
  playerName?: string;
  gender?: string;
};

function resultMessage(result: TowerAttemptResult): string {
  if (result.error === "max_floor") return "오늘 가능한 최고층에 도달했습니다.";
  if (result.success) return `${result.floor ?? "-"}층 돌파`;
  return `${result.floor ?? "-"}층 실패 · 전투력 ${(result.power ?? 0).toLocaleString("ko-KR")}/${(result.requiredPower ?? 0).toLocaleString("ko-KR")}`;
}

function errorMessage(error: string | undefined): string {
  if (error === "unauthorized") return "로그인이 필요합니다.";
  if (error === "no_character") return "캐릭터가 없어 입장할 수 없습니다.";
  if (error === "fishing_job") return "낚시 계열 직업은 숙련의 탑에 입장할 수 없습니다.";
  return "입장을 진행할 수 없습니다. 잠시 후 다시 시도해 주세요.";
}

export function V2MasteryTowerBattleView() {
  const router = useRouter();
  const [result, setResult] = useState<TowerAttemptResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState(false);

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
  const canContinue = Boolean(result?.ok && !busy && !isMaxFloor);

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

      {result?.ok && (
        <StatusBanner tone={result.success || isMaxFloor ? "success" : "error"}>
          {resultMessage(result)}
        </StatusBanner>
      )}

      {result?.log && result.log.length > 0 && (
        <Card padding="md" className="space-y-3">
          <div className="flex items-center gap-2">
            <CastleTurret size={18} weight="duotone" className="text-emerald-500" />
            <h2 className="text-base font-semibold">전투 로그</h2>
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
            label: replay.outcome === "win" ? "다음 층 입장" : "재입장",
            busyLabel: "입장 중...",
            busy,
            disabled: !canContinue,
            onClick: enterTower,
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
            onClick={() => void enterTower()}
            disabled={!canContinue}
            className="h-10 rounded-md border border-zinc-200 px-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            다시 입장
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
