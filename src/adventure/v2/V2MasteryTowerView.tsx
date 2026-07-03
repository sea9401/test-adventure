"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowClockwise, CastleTurret, Certificate, CheckCircle } from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { StatusBanner } from "@/components/ui/StatusBanner";
import { SubViewHeader } from "@/components/ui/SubViewHeader";

type TowerState = {
  date: string;
  todayBestFloor: number;
  claimed: boolean;
  lifetimeBestFloor: number;
  firstClearRewardsClaimed: number[];
};

type TowerJob = {
  id: string;
  name: string;
  tier: number;
  group: string;
  mastery: number;
};

type TowerStatus = {
  ok?: boolean;
  error?: string;
  tower: TowerState;
  certificates: number;
  claimPreview: {
    base: number;
    firstClearBonus: number;
    total: number;
    newlyClaimedMilestones: number[];
  };
  power: number;
  nextFloor: number | null;
  nextRequiredPower: number | null;
  rewards: {
    samples: { floor: number; reward: number }[];
    milestones: { floor: number; bonus: number }[];
  };
  jobs: TowerJob[];
};

export function V2MasteryTowerView({
  onBack,
  onRefreshGameState,
}: {
  onBack: () => void;
  onRefreshGameState?: () => void | Promise<void>;
}) {
  const [status, setStatus] = useState<TowerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"attempt" | "claim" | "use" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [amount, setAmount] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v2/mastery-tower");
      const j = (await res.json().catch(() => null)) as TowerStatus | null;
      if (!j?.ok) {
        setMsg(`✗ ${j?.error ?? `http ${res.status}`}`);
        return;
      }
      setStatus(j);
      setSelectedJobId((prev) => prev || j.jobs[0]?.id || "");
      setAmount((prev) => prev || String(j.certificates || 0));
    } catch (err) {
      setMsg(`✗ ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void refresh();
    }, 0);
    return () => clearTimeout(timer);
  }, [refresh]);

  const selectedJob = useMemo(
    () => status?.jobs.find((job) => job.id === selectedJobId) ?? null,
    [selectedJobId, status?.jobs],
  );

  async function attempt() {
    setBusy("attempt");
    setMsg(null);
    try {
      const res = await fetch("/api/v2/mastery-tower/attempt", {
        method: "POST",
      });
      const j = (await res.json().catch(() => null)) as {
        ok?: boolean;
        success?: boolean;
        error?: string;
        floor?: number | null;
        requiredPower?: number | null;
        power?: number;
      } | null;
      if (!j?.ok) {
        setMsg(`✗ ${j?.error ?? `http ${res.status}`}`);
        return;
      }
      if (j.success) {
        setMsg(`✓ ${j.floor}층 돌파`);
      } else if (j.error === "max_floor") {
        setMsg("✓ 오늘 가능한 최고층에 도달했습니다");
      } else {
        setMsg(
          `✗ ${j.floor}층 실패 · 전투력 ${j.power ?? 0}/${j.requiredPower ?? 0}`,
        );
      }
      await refresh();
    } catch (err) {
      setMsg(`✗ ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function claim() {
    setBusy("claim");
    setMsg(null);
    try {
      const res = await fetch("/api/v2/mastery-tower/claim", {
        method: "POST",
      });
      const j = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        gained?: number;
        certificates?: number;
      } | null;
      if (!j?.ok) {
        setMsg(`✗ ${j?.error ?? `http ${res.status}`}`);
        return;
      }
      setMsg(`✓ 숙련 증서 +${(j.gained ?? 0).toLocaleString("ko-KR")}`);
      await refresh();
    } catch (err) {
      setMsg(`✗ ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function spendCertificates() {
    if (!selectedJobId) return;
    const useAmount = Math.max(0, Math.floor(Number(amount) || 0));
    setBusy("use");
    setMsg(null);
    try {
      const res = await fetch("/api/v2/mastery-tower/use-certificate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobId: selectedJobId, amount: useAmount }),
      });
      const j = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        jobName?: string;
        used?: number;
        jobMastery?: number;
      } | null;
      if (!j?.ok) {
        setMsg(`✗ ${j?.error ?? `http ${res.status}`}`);
        return;
      }
      setMsg(
        `✓ ${j.jobName ?? "직업"} 숙련도 +${(j.used ?? 0).toLocaleString("ko-KR")}` +
          (typeof j.jobMastery === "number"
            ? ` (현재 ${j.jobMastery.toLocaleString("ko-KR")})`
            : ""),
      );
      await refresh();
      await onRefreshGameState?.();
    } catch (err) {
      setMsg(`✗ ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  const canClaim = Boolean(status && !status.tower.claimed && status.claimPreview.total > 0);
  const canAttempt = Boolean(status && status.nextFloor != null);
  const canUse =
    Boolean(status && status.certificates > 0 && selectedJobId) &&
    Math.floor(Number(amount) || 0) > 0;

  return (
    <main className="mx-auto max-w-[720px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <SubViewHeader title="숙련의 탑" onBack={onBack} />

      {msg && (
        <StatusBanner tone={msg.startsWith("✓") ? "success" : "error"}>
          {msg}
        </StatusBanner>
      )}

      <Card padding="md" className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">오늘의 등반</h2>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              재도전은 무제한입니다. 보상은 오늘 최고층 기준으로 한 번만 수령합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded-md border border-zinc-200 p-2 text-zinc-500 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
            aria-label="새로고침"
          >
            <ArrowClockwise size={16} />
          </button>
        </div>

        {loading || !status ? (
          <p className="py-5 text-center text-sm text-zinc-500 dark:text-zinc-400">
            불러오는 중…
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <Stat label="오늘 최고층" value={`${status.tower.todayBestFloor}층`} />
              <Stat label="역대 최고층" value={`${status.tower.lifetimeBestFloor}층`} />
              <Stat label="내 전투력" value={status.power.toLocaleString("ko-KR")} />
              <Stat
                label="보유 증서"
                value={status.certificates.toLocaleString("ko-KR")}
              />
            </div>

            <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900/60">
              {status.nextFloor == null ? (
                <p className="font-medium text-emerald-600 dark:text-emerald-400">
                  오늘 30층까지 돌파했습니다.
                </p>
              ) : (
                <p>
                  다음 도전:{" "}
                  <span className="font-semibold">{status.nextFloor}층</span>{" "}
                  <span className="text-zinc-500 dark:text-zinc-400">
                    권장 전투력 {status.nextRequiredPower?.toLocaleString("ko-KR")}
                  </span>
                </p>
              )}
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                수령 예정: 기본{" "}
                {status.claimPreview.base.toLocaleString("ko-KR")} + 첫 도달{" "}
                {status.claimPreview.firstClearBonus.toLocaleString("ko-KR")} ={" "}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {status.claimPreview.total.toLocaleString("ko-KR")}
                </span>
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void attempt()}
                disabled={busy != null || !canAttempt}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-zinc-900 px-3 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
              >
                <CastleTurret size={16} weight="duotone" />
                {busy === "attempt" ? "도전 중…" : "다음 층 도전"}
              </button>
              <button
                type="button"
                onClick={() => void claim()}
                disabled={busy != null || !canClaim}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-emerald-600 px-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CheckCircle size={16} weight="duotone" />
                {status.tower.claimed
                  ? "오늘 수령 완료"
                  : busy === "claim"
                    ? "수령 중…"
                    : "보상 수령"}
              </button>
            </div>
          </>
        )}
      </Card>

      {status && (
        <Card padding="md" className="space-y-3">
          <div className="flex items-center gap-2">
            <Certificate size={18} weight="duotone" className="text-amber-500" />
            <h2 className="text-base font-semibold">숙련 증서 사용</h2>
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_120px_auto]">
            <select
              value={selectedJobId}
              onChange={(e) => setSelectedJobId(e.currentTarget.value)}
              className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-sky-400 dark:border-zinc-700 dark:bg-zinc-950"
            >
              {status.jobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.name} · 현재 {job.mastery.toLocaleString("ko-KR")}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              max={status.certificates}
              value={amount}
              onChange={(e) => setAmount(e.currentTarget.value)}
              className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-sky-400 dark:border-zinc-700 dark:bg-zinc-950"
            />
            <button
              type="button"
              onClick={() => void spendCertificates()}
              disabled={busy != null || !canUse}
              className="h-10 rounded-md bg-amber-600 px-4 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy === "use" ? "사용 중…" : "사용"}
            </button>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {selectedJob
              ? `${selectedJob.name}에 증서를 투자합니다. 잠긴 직업에는 사용할 수 없습니다.`
              : "사용할 직업을 선택하세요."}
          </p>
        </Card>
      )}

      {status && (
        <Card padding="md" className="space-y-2">
          <h2 className="text-base font-semibold">보상표</h2>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            {status.rewards.samples.map((row) => (
              <div
                key={row.floor}
                className="rounded-md border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="font-semibold">{row.floor}층</div>
                <div className="text-zinc-500 dark:text-zinc-400">
                  {row.reward.toLocaleString("ko-KR")}
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            첫 도달 보너스:{" "}
            {status.rewards.milestones
              .map((m) => `${m.floor}층 +${m.bonus}`)
              .join(" · ")}
          </p>
        </Card>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}
