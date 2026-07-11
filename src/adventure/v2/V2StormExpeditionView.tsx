"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowClockwise, CloudLightning, Flag, ShieldChevron } from "@phosphor-icons/react";
import type { Gender } from "@/adventure/profile/avatars";
import type { ReplayPayload } from "@/adventure/data/v2/replayPayload";
import type { StormExpeditionRouteId } from "@/adventure/data/v2/stormExpedition";
import { ReplayBattleScene } from "@/adventure/v2/ReplayBattleScene";
import { useGameState } from "@/adventure/v2/GameStateProvider";
import { Card } from "@/components/ui/Card";
import { LoadErrorBanner } from "@/components/ui/LoadErrorBanner";
import { StatusBanner } from "@/components/ui/StatusBanner";
import { SubViewHeader } from "@/components/ui/SubViewHeader";

type ExpeditionStatus = {
  ok?: boolean;
  error?: string;
  unlocked?: boolean;
  unlockDepth?: number;
  frontierDepth?: number;
  attemptsLeft?: number;
  stageCount?: number;
  gold?: number;
  state?: {
    clears: number;
    active: null | {
      routeId: StormExpeditionRouteId;
      stage: number;
      hp: number;
      mp: number;
      pendingGold: number;
    };
  };
  routes?: Array<{
    id: StormExpeditionRouteId;
    name: string;
    tagline: string;
    threat: string;
    accent: "sky" | "violet" | "amber";
  }>;
  rewards?: number[];
  success?: boolean;
  bossClear?: boolean;
  failed?: boolean;
  withdrew?: boolean;
  gainedGold?: number;
  stage?: number;
  replay?: ReplayPayload;
  startPlayerHp?: number;
  playerName?: string;
  gender?: string;
};

const ERROR_MESSAGES: Record<string, string> = {
  locked: "심해 폐허 6을 돌파하면 원정이 열립니다.",
  no_attempts: "오늘의 원정 입장 횟수를 모두 사용했습니다.",
  already_active: "이미 진행 중인 원정이 있습니다.",
  no_active: "진행 중인 원정이 없습니다.",
  nothing_to_claim: "첫 구간을 돌파한 뒤부터 귀환할 수 있습니다.",
};

export function V2StormExpeditionView() {
  const router = useRouter();
  const { refreshGameState } = useGameState();
  const [status, setStatus] = useState<ExpeditionStatus | null>(null);
  const [result, setResult] = useState<ExpeditionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const response = await fetch("/api/v2/storm-expedition");
      const json = await response.json().catch(() => null) as ExpeditionStatus | null;
      if (!json?.ok) throw new Error(json?.error ?? `http ${response.status}`);
      setStatus(json);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const act = useCallback(async (
    action: "start" | "advance" | "withdraw",
    routeId?: StormExpeditionRouteId,
  ) => {
    setBusy(true);
    try {
      const response = await fetch("/api/v2/storm-expedition", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, routeId }),
      });
      const json = await response.json().catch(() => null) as ExpeditionStatus | null;
      if (!json) {
        setResult({ ok: false, error: `http ${response.status}` });
        return;
      }
      setStatus(json);
      setResult(action === "start" ? null : json);
      if ((json.gainedGold ?? 0) > 0) await refreshGameState();
    } catch {
      setResult({ ok: false, error: "network" });
    } finally {
      setBusy(false);
    }
  }, [refreshGameState]);

  const active = status?.state?.active ?? null;
  const activeRoute = status?.routes?.find((route) => route.id === active?.routeId) ?? null;
  const replay = useMemo(() => {
    if (!result?.replay) return null;
    return {
      payload: result.replay,
      outcome: result.success ? "win" as const : "lose" as const,
      playerName: result.playerName ?? "모험가",
      gender: (result.gender ?? "male1") as Gender,
    };
  }, [result]);

  return (
    <main className="mx-auto max-w-[720px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <SubViewHeader
        title={
          <>
            <CloudLightning size={21} weight="duotone" className="text-sky-500" />
            원정
          </>
        }
        onBack={() => router.push("/battle")}
      />

      {loadError && <LoadErrorBanner onRetry={refresh} />}
      {loading && !status && <Card padding="md" className="text-center text-sm text-zinc-500">원정 정보를 불러오는 중...</Card>}

      {status && (
        <Card padding="md" className="space-y-3 overflow-hidden border-sky-200 bg-gradient-to-br from-sky-50 to-white dark:border-sky-900/70 dark:from-sky-950/30 dark:to-zinc-950">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-600 dark:text-sky-400">Risk expedition</p>
              <h1 className="mt-1 text-xl font-bold">전리품을 지킬지, 폭풍 안쪽으로 갈지</h1>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">네 번의 연속 전투에서 HP와 MP가 이어집니다. 패배하면 이번 원정의 미확정 골드를 모두 잃습니다.</p>
            </div>
            <button type="button" onClick={() => void refresh()} className="rounded-md border border-sky-200 p-2 text-sky-600 dark:border-sky-800" aria-label="새로고침">
              <ArrowClockwise size={16} />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <Metric label="오늘 입장" value={`${status.attemptsLeft ?? 0}회`} />
            <Metric label="완주" value={`${status.state?.clears ?? 0}회`} />
            <Metric label="보유 골드" value={`${(status.gold ?? 0).toLocaleString("ko-KR")} G`} />
          </div>
        </Card>
      )}

      {status && !status.unlocked && (
        <StatusBanner tone="warning">
          심해 폐허 6 돌파 후 개방 · 현재 깊이 {status.frontierDepth ?? 2}/{status.unlockDepth ?? 72}
        </StatusBanner>
      )}

      {result?.error && (
        <StatusBanner tone="error">{ERROR_MESSAGES[result.error] ?? "원정을 진행하지 못했습니다. 잠시 후 다시 시도해 주세요."}</StatusBanner>
      )}
      {result?.bossClear && <StatusBanner tone="success">폭풍의 핵을 돌파했습니다. {(result.gainedGold ?? 0).toLocaleString("ko-KR")} G를 확보했습니다.</StatusBanner>}
      {result?.withdrew && <StatusBanner tone="success">안전하게 귀환해 {(result.gainedGold ?? 0).toLocaleString("ko-KR")} G를 확보했습니다.</StatusBanner>}
      {result?.failed && <StatusBanner tone="error">원정대가 퇴각했습니다. 이번 원정의 미확정 보상은 사라졌습니다.</StatusBanner>}

      {status?.unlocked && !active && !replay && (
        <section className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <Flag size={18} className="text-sky-500" />
            <h2 className="font-semibold">항로 선택</h2>
          </div>
          {status.routes?.map((route) => (
            <button
              type="button"
              key={route.id}
              disabled={busy || (status.attemptsLeft ?? 0) <= 0}
              onClick={() => void act("start", route.id)}
              className="w-full rounded-xl border border-zinc-200 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-sky-800"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold">{route.name}</span>
                <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">{route.threat}</span>
              </div>
              <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">{route.tagline}</p>
            </button>
          ))}
        </section>
      )}

      {active && !replay && (
        <Card padding="md" className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-zinc-500">진행 중인 항로</p>
              <h2 className="text-lg font-bold">{activeRoute?.name ?? "폭풍 항로"}</h2>
            </div>
            <span className="rounded-full bg-sky-100 px-3 py-1 text-sm font-semibold text-sky-700 dark:bg-sky-950 dark:text-sky-300">{active.stage + 1}/{status?.stageCount ?? 4} 구간</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <Metric label="남은 HP" value={active.hp.toLocaleString("ko-KR")} />
            <Metric label="남은 MP" value={active.mp.toLocaleString("ko-KR")} />
            <Metric label="미확정" value={`${active.pendingGold.toLocaleString("ko-KR")} G`} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={busy || active.stage === 0} onClick={() => void act("withdraw")} className="h-11 rounded-md border border-zinc-200 text-sm font-semibold disabled:opacity-40 dark:border-zinc-700">지금 귀환</button>
            <button type="button" disabled={busy} onClick={() => void act("advance")} className="h-11 rounded-md bg-sky-600 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50">{busy ? "전투 중..." : active.stage === 3 ? "우두머리 도전" : "다음 구간 진입"}</button>
          </div>
        </Card>
      )}

      {replay && (
        <ReplayBattleScene
          payload={replay.payload}
          startPlayerHp={result?.startPlayerHp}
          playerName={replay.playerName}
          gender={replay.gender}
          exp={0}
          maxExp={1}
          playerSubtitle={`${activeRoute?.name ?? "원정"} ${(result?.stage ?? 0) + 1}구간`}
          outcome={replay.outcome}
          outcomeAction={{
            label: active ? "원정 상황 확인" : "원정대로 돌아가기",
            busyLabel: "이동 중...",
            busy: false,
            onClick: () => setResult(null),
          }}
        />
      )}

      {active && active.stage > 0 && !replay && (
        <div className="flex items-center gap-2 px-1 text-xs text-amber-700 dark:text-amber-300">
          <ShieldChevron size={15} /> 지금 귀환하면 미확정 골드를 모두 확보합니다.
        </div>
      )}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200/80 bg-white/80 px-2 py-2.5 dark:border-zinc-800 dark:bg-zinc-950/70">
      <p className="text-[11px] text-zinc-500">{label}</p>
      <p className="mt-0.5 font-semibold tabular-nums">{value}</p>
    </div>
  );
}
