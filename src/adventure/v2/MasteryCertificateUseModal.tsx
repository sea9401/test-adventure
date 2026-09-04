"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Certificate, X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  formatThousands,
  NumberInput,
  parseAmount,
} from "@/components/ui/NumberInput";
import { TabBar } from "@/components/ui/TabBar";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import type {
  MasteryCertificateJob,
  MasteryCertificateStatus,
} from "@/lib/server/masteryCertificateStatus";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useModalA11y } from "@/lib/useModalA11y";
import { useSystemToast } from "./RewardToastProvider";

type CertificateUseMode = "mastery" | "proficiency";

const JOB_GROUP_LABELS: Record<string, string> = {
  warrior: "전사",
  martial: "무도가",
  mage: "마법사",
  rogue: "도적",
  survivor: "생존자",
  mutant: "변이자",
};

export function masteryCertificateErrorLabel(error: string | undefined): string {
  if (error === "no_certificate") return "보유한 숙련 증서가 없습니다.";
  if (error === "job_locked" || error === "bad_job") {
    return "현재 사용할 수 없는 직업입니다.";
  }
  if (error === "fishing_job" || error === "farming_job") {
    return "이 직업에는 숙련 증서를 사용할 수 없습니다.";
  }
  return error || "숙련 증서를 사용할 수 없습니다.";
}

export function MasteryCertificateEntryCard({
  certificates,
  onUse,
}: {
  certificates: number;
  onUse: () => void;
}) {
  return (
    <Card padding="md" className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <Certificate
          size={22}
          weight="duotone"
          className="shrink-0 text-amber-600 dark:text-amber-300"
          aria-hidden
        />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">숙련 증서 사용</h2>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            보유 {certificates.toLocaleString("ko-KR")}개 · 직업 숙련도 또는 숙달 포인트
          </p>
        </div>
      </div>
      <Button size="sm" variant="warning" onClick={onUse} disabled={certificates <= 0}>
        사용
      </Button>
    </Card>
  );
}

export function MasteryCertificateUseModal({
  open,
  initialStatus = null,
  onClose,
  onUsed,
}: {
  open: boolean;
  initialStatus?: MasteryCertificateStatus | null;
  onClose: () => void;
  onUsed: () => void | Promise<void>;
}) {
  if (!open) return null;
  return (
    <OpenMasteryCertificateUseModal
      initialStatus={initialStatus}
      onClose={onClose}
      onUsed={onUsed}
    />
  );
}

function OpenMasteryCertificateUseModal({
  initialStatus,
  onClose,
  onUsed,
}: {
  initialStatus: MasteryCertificateStatus | null;
  onClose: () => void;
  onUsed: () => void | Promise<void>;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<MasteryCertificateStatus | null>(
    initialStatus,
  );
  const [mode, setMode] = useState<CertificateUseMode>("mastery");
  const [selectedJobId, setSelectedJobId] = useState(
    initialStatus?.jobs[0]?.id ?? "",
  );
  const [selectedGroup, setSelectedGroup] = useState(
    initialStatus?.jobs[0]?.group ?? "",
  );
  const [amount, setAmount] = useState(
    formatThousands(String(initialStatus?.certificates ?? 0)),
  );
  const [loading, setLoading] = useState(initialStatus == null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { notifySystem } = useSystemToast();

  useEscapeKey(onClose);
  useModalA11y(panelRef);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/v2/me/mastery-certificates");
      const json = (await response.json().catch(() => null)) as
        | ({ ok?: boolean; error?: string } & MasteryCertificateStatus)
        | null;
      if (!response.ok || !json?.ok) {
        setError(masteryCertificateErrorLabel(json?.error));
        return null;
      }
      const next = { certificates: json.certificates, jobs: json.jobs };
      setStatus(next);
      setSelectedJobId((previous) =>
        next.jobs.some((job) => job.id === previous)
          ? previous
          : (next.jobs[0]?.id ?? ""),
      );
      setSelectedGroup((previous) =>
        next.jobs.some((job) => job.group === previous)
          ? previous
          : (next.jobs[0]?.group ?? ""),
      );
      setAmount(formatThousands(String(next.certificates)));
      setError(null);
      return next;
    } catch (cause) {
      setError(`불러오기 실패: ${(cause as Error).message}`);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 모달 진입 시 서버의 최신 증서 상태를 조회한다.
    void loadStatus();
  }, [loadStatus]);

  const groups = useMemo(() => {
    const seen = new Set<string>();
    return (status?.jobs ?? []).flatMap((job) => {
      if (seen.has(job.group)) return [];
      seen.add(job.group);
      return [
        {
          key: job.group,
          label: JOB_GROUP_LABELS[job.group] ?? job.group,
          badge: status?.jobs.filter((candidate) => candidate.group === job.group)
            .length,
        },
      ];
    });
  }, [status?.jobs]);
  const visibleJobs = (status?.jobs ?? []).filter(
    (job) => job.group === selectedGroup,
  );
  const selectedJob = (status?.jobs ?? []).find(
    (job) => job.id === selectedJobId,
  );
  const useAmount = Math.min(
    status?.certificates ?? 0,
    parseAmount(amount),
  );
  const canUse =
    !loading &&
    !busy &&
    useAmount > 0 &&
    (mode === "proficiency" || selectedJob != null);

  async function handleUseCertificates() {
    if (!canUse) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/v2/mastery-tower/use-certificate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode,
          amount: useAmount,
          ...(mode === "mastery" ? { jobId: selectedJobId } : {}),
        }),
      });
      const json = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        used?: number;
        remaining?: number;
        jobName?: string;
      } | null;
      if (!response.ok || !json?.ok) {
        setError(masteryCertificateErrorLabel(json?.error));
        if (json?.error === "no_certificate" || json?.error === "job_locked") {
          await loadStatus();
        }
        return;
      }
      const used = json.used ?? useAmount;
      const remaining = Math.max(0, json.remaining ?? 0);
      setStatus((previous) =>
        previous ? { ...previous, certificates: remaining } : previous,
      );
      setAmount(formatThousands(String(remaining)));
      await onUsed();
      notifySystem(
        mode === "proficiency"
          ? `✓ 숙련 증서 ${used.toLocaleString("ko-KR")}개를 숙달 포인트로 전환했습니다.`
          : `✓ ${json.jobName ?? selectedJob?.name ?? "선택한 직업"} 숙련도 +${used.toLocaleString("ko-KR")}`,
      );
      if (remaining <= 0) onClose();
      else await loadStatus();
    } catch (cause) {
      setError(`사용 실패: ${(cause as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="ui-modal-reveal fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-3 backdrop-blur-sm sm:items-center sm:p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !busy) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mastery-certificate-use-title"
        className={`${SURFACE_CARD} ui-modal-panel max-h-[90dvh] w-full max-w-2xl overflow-y-auto p-4 shadow-2xl sm:p-5`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Certificate
              size={22}
              weight="duotone"
              className="shrink-0 text-amber-600 dark:text-amber-300"
              aria-hidden
            />
            <div>
              <h2 id="mastery-certificate-use-title" className="text-base font-semibold">
                숙련 증서 사용
              </h2>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                보유 {(status?.certificates ?? 0).toLocaleString("ko-KR")}개
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="숙련 증서 사용 닫기"
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 disabled:opacity-40 dark:hover:bg-zinc-800"
          >
            <X size={18} weight="bold" aria-hidden />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2" role="group" aria-label="숙련 증서 사용 용도">
          {([
            ["mastery", "직업 숙련도", "선택한 직업을 성장시킵니다."],
            ["proficiency", "숙달 포인트", "공용 잔액으로 1:1 전환합니다."],
          ] as const).map(([value, label, description]) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
              className={`rounded-md border px-3 py-2 text-left transition ${
                mode === value
                  ? "border-amber-500 bg-amber-50 text-amber-950 dark:border-amber-400 dark:bg-zinc-800 dark:text-amber-100"
                  : "border-zinc-200 bg-white text-zinc-700 hover:border-amber-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
              }`}
            >
              <span className="block text-sm font-semibold">{label}</span>
              <span className="mt-0.5 block text-[11px] text-zinc-500 dark:text-zinc-400">
                {description}
              </span>
            </button>
          ))}
        </div>

        {error && (
          <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-zinc-950 dark:text-rose-300">
            {error}
          </p>
        )}

        {loading && !status ? (
          <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
            숙련 증서를 불러오는 중…
          </p>
        ) : mode === "mastery" ? (
          <div className="mt-4 space-y-3">
            {groups.length > 0 ? (
              <>
                <TabBar
                  tabs={groups}
                  active={selectedGroup}
                  onChange={(group) => {
                    setSelectedGroup(group);
                    const first = status?.jobs.find((job) => job.group === group);
                    if (first) setSelectedJobId(first.id);
                  }}
                  ariaLabel="숙련 증서를 사용할 직업군"
                  scrollable
                />
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {visibleJobs.map((job) => (
                    <JobButton
                      key={job.id}
                      job={job}
                      selected={job.id === selectedJobId}
                      onSelect={() => setSelectedJobId(job.id)}
                    />
                  ))}
                </div>
              </>
            ) : (
              <p className={`${SURFACE_INSET} px-3 py-4 text-center text-sm text-zinc-500 dark:text-zinc-400`}>
                숙련 증서를 사용할 수 있는 직업이 없습니다.
              </p>
            )}
          </div>
        ) : (
          <p className={`${SURFACE_INSET} mt-4 px-3 py-3 text-sm leading-relaxed text-blue-800 dark:text-blue-200`}>
            숙련 증서 1개를 숙달 포인트 1점으로 전환합니다. 전환한 포인트는 수행과
            스킬 습득·강화에 사용할 수 있습니다.
          </p>
        )}

        <div className="sticky bottom-0 mt-4 border-t border-zinc-200 bg-white pt-3 dark:border-zinc-700 dark:bg-zinc-950">
          <div className="grid items-end gap-2 sm:grid-cols-[1fr_auto]">
            <label className="grid gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">
              사용할 증서
              <NumberInput
                min={1}
                max={status?.certificates ?? 0}
                value={amount}
                onValueChange={setAmount}
                aria-label="사용할 숙련 증서 수량"
                className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm font-normal text-zinc-900 outline-none focus:border-amber-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </label>
            <Button
              size="md"
              variant="warning"
              onClick={() => void handleUseCertificates()}
              disabled={!canUse}
            >
              {busy
                ? "사용 중…"
                : useAmount > 0
                  ? `${useAmount.toLocaleString("ko-KR")}개 ${mode === "proficiency" ? "전환" : "사용"}`
                  : "사용"}
            </Button>
          </div>
          <p className={`${SURFACE_INSET} mt-2 px-3 py-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400`}>
            {mode === "proficiency"
              ? `숙달 포인트 +${useAmount.toLocaleString("ko-KR")} · 전환 후에는 증서로 되돌릴 수 없습니다.`
              : selectedJob
                ? `${selectedJob.name}에 투자합니다. 사용 후 예상 숙련도 ${(selectedJob.mastery + useAmount).toLocaleString("ko-KR")}`
                : "사용할 직업을 선택하세요."}
          </p>
        </div>
      </div>
    </div>
  );
}

function JobButton({
  job,
  selected,
  onSelect,
}: {
  job: MasteryCertificateJob;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`min-h-16 rounded-md border px-3 py-2 text-left transition ${
        selected
          ? "border-amber-500 bg-amber-50 text-amber-950 dark:border-amber-400 dark:bg-zinc-800 dark:text-amber-100"
          : "border-zinc-200 bg-white text-zinc-800 hover:border-amber-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      }`}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="min-w-0 text-sm font-semibold leading-snug">{job.name}</span>
        <span className="shrink-0 text-[10px] font-medium text-zinc-400">
          {job.tier > 0 ? `${job.tier}차` : "기본"}
        </span>
      </span>
      <span className="mt-1 block text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
        숙련도 {job.mastery.toLocaleString("ko-KR")}
      </span>
    </button>
  );
}
