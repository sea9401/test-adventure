"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowClockwise, CastleTurret, Certificate, CheckCircle } from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { StatusBanner } from "@/components/ui/StatusBanner";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { V2_SKILLS } from "@/adventure/data/v2/v2Skills";

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

type TowerGuardian = {
  name: string;
  gimmickName: string | null;
  gimmickDescription: string | null;
  hp: number;
  atk: number;
  def: number;
  spd: number;
  accuracy: number;
  evasionPct: number;
  atkType: "physical" | "magic";
  critPct: number;
  bonusAttackChancePct: number;
  skills: string[];
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
  nextGuardian: TowerGuardian | null;
  rewards: {
    samples: { floor: number; reward: number }[];
    milestones: { floor: number; bonus: number }[];
  };
  jobs: TowerJob[];
};

export function V2MasteryTowerView({
  onBack,
  onEnterBattle,
  onRefreshGameState,
}: {
  onBack: () => void;
  onEnterBattle: () => void;
  onRefreshGameState?: () => void | Promise<void>;
}) {
  const [status, setStatus] = useState<TowerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"claim" | "use" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [amount, setAmount] = useState("");
  const [confirmClaimOpen, setConfirmClaimOpen] = useState(false);

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

  async function claim() {
    setBusy("claim");
    setMsg(null);
    setConfirmClaimOpen(false);
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
                  오늘 50층까지 돌파했습니다.
                </p>
              ) : (
                <div className="space-y-2">
                  <p>
                    다음 도전:{" "}
                    <span className="font-semibold">{status.nextFloor}층</span>{" "}
                    <span className="text-zinc-500 dark:text-zinc-400">
                      권장 전투력 {status.nextRequiredPower?.toLocaleString("ko-KR")}
                    </span>
                  </p>
                  {status.nextGuardian && (
                    <div className="grid grid-cols-2 gap-1.5 text-xs sm:grid-cols-4">
                      <Stat
                        label={status.nextGuardian.name}
                        value={`HP ${status.nextGuardian.hp.toLocaleString("ko-KR")}`}
                      />
                      <Stat
                        label={status.nextGuardian.atkType === "magic" ? "마법 공격" : "물리 공격"}
                        value={status.nextGuardian.atk.toLocaleString("ko-KR")}
                      />
                      <Stat label="방어" value={status.nextGuardian.def.toLocaleString("ko-KR")} />
                      <Stat label="속도" value={status.nextGuardian.spd.toLocaleString("ko-KR")} />
                    </div>
                  )}
                  {status.nextGuardian && (
                    <>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      명중 {status.nextGuardian.accuracy}% · 회피{" "}
                      {status.nextGuardian.evasionPct}% · 치명{" "}
                      {status.nextGuardian.critPct}% · 추가타{" "}
                      {status.nextGuardian.bonusAttackChancePct}%{" "}
                      {status.nextGuardian.skills.length > 0
                        ? `· ${status.nextGuardian.skills
                            .map((id) => towerSkillName(id))
                            .join(" / ")}`
                        : ""}
                    </p>
                    {status.nextGuardian.gimmickName && (
                      <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200">
                        <span className="font-semibold">
                          {status.nextGuardian.gimmickName}
                        </span>{" "}
                        {status.nextGuardian.gimmickDescription}
                      </div>
                    )}
                    </>
                  )}
                </div>
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
                onClick={onEnterBattle}
                disabled={busy != null || !canAttempt}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-zinc-900 px-3 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
              >
                <CastleTurret size={16} weight="duotone" />
                입장
              </button>
              <button
                type="button"
                onClick={() => setConfirmClaimOpen(true)}
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

      {status && confirmClaimOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="mastery-tower-claim-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && busy == null) {
              setConfirmClaimOpen(false);
            }
          }}
        >
          <div className="w-full max-w-sm rounded-md border border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
            <h2 id="mastery-tower-claim-title" className="text-base font-bold">
              보상 수령 확인
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
              현재 오늘 최고 기록은{" "}
              <b className="text-zinc-900 dark:text-zinc-100">
                {status.tower.todayBestFloor}층
              </b>
              이고, 지금 수령하면 숙련 증서{" "}
              <b className="text-emerald-700 dark:text-emerald-300">
                {status.claimPreview.total.toLocaleString("ko-KR")}개
              </b>
              를 받습니다.
            </p>
            <p className="mt-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
              재도전은 계속 가능하지만 오늘 보상은 한 번만 수령합니다. 기록을 더
              갱신한 뒤 수령하시겠습니까?
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={busy != null || !canAttempt}
                onClick={() => {
                  setConfirmClaimOpen(false);
                  onEnterBattle();
                }}
                className="h-10 rounded-md border border-zinc-300 px-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                더 도전하기
              </button>
              <button
                type="button"
                disabled={busy != null || !canClaim}
                onClick={() => void claim()}
                className="h-10 rounded-md bg-emerald-600 px-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy === "claim" ? "수령 중…" : "지금 수령"}
              </button>
            </div>
            <button
              type="button"
              disabled={busy != null}
              onClick={() => setConfirmClaimOpen(false)}
              className="mt-2 h-9 w-full rounded-md px-3 text-sm font-medium text-zinc-500 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              닫기
            </button>
          </div>
        </div>
      )}

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
              ? `${selectedJob.name}에 증서를 투자합니다. 낚시 계열과 잠긴 직업에는 사용할 수 없습니다.`
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

function towerSkillName(id: string): string {
  const skill = V2_SKILLS[id as keyof typeof V2_SKILLS];
  return skill?.name ?? id;
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
