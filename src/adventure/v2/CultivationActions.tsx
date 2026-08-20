"use client";

import { useRef, useState } from "react";
import { CaretDown, Check, X } from "@phosphor-icons/react";
import { cultivationOutcomeLabel } from "@/adventure/data/v2/proficiency";
import { Button } from "@/components/ui/Button";
import {
  SURFACE_ACCENT,
  SURFACE_CARD,
  SURFACE_INSET,
} from "@/components/ui/surfaces";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useModalA11y } from "@/lib/useModalA11y";
import { jobCultivationProfile, jobCultivationSummary } from "./jobExplorer";

export type CultivationMode = "once" | "max";

export type CultivationRunSummary = {
  performed?: number;
  spent?: number;
  greatSuccesses?: number;
  awakenings?: number;
  redistributedGrowthPoints?: number;
  growthRespecPoints?: number;
  hasMore?: boolean;
  mult?: number;
};

export type CultivationJobOption = {
  id: string;
  name: string;
  summary: string;
};

export function visitedCultivationJobOptions(
  jobs: readonly { id: string; name: string; visited?: boolean }[],
): CultivationJobOption[] {
  return jobs.flatMap((job) =>
    job.visited && jobCultivationProfile(job.id)
      ? [
          {
            id: job.id,
            name: job.name,
            summary: jobCultivationSummary(job.id),
          },
        ]
      : [],
  );
}

export function cultivationRequestInit(
  mode: CultivationMode,
  targetJobId: string,
): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(
      mode === "max"
        ? { mode: "max", targetJobId }
        : { targetJobId },
    ),
  };
}

export function cultivationCompletionMessage(
  summary: CultivationRunSummary,
  mode: CultivationMode,
  fallbackSpent: number,
  targetJobName?: string,
): string {
  const spent = summary.spent ?? fallbackSpent;
  const redistributed = summary.redistributedGrowthPoints ?? 0;
  const redistribution =
    redistributed > 0
      ? `성장 재분배 +${redistributed.toLocaleString()}${
          summary.growthRespecPoints != null
            ? ` (대기 ${summary.growthRespecPoints.toLocaleString()})`
            : ""
        }`
      : "";

  if (mode === "once") {
    const outcome = cultivationOutcomeLabel(summary.mult ?? 1);
    const special = outcome ? `${outcome} ×${summary.mult}!` : "";
    const details = [special, redistribution].filter(Boolean);
    return `✓ ${targetJobName ? `${targetJobName} 수행` : "수행"} 완료 (숙달 포인트 -${spent.toLocaleString()})${
      details.length > 0 ? ` · ${details.join(" · ")}` : ""
    }`;
  }

  const details = [
    (summary.greatSuccesses ?? 0) > 0
      ? `대성공 ${summary.greatSuccesses?.toLocaleString()}회`
      : "",
    (summary.awakenings ?? 0) > 0
      ? `각성 ${summary.awakenings?.toLocaleString()}회`
      : "",
    redistribution,
    summary.hasMore ? "남은 포인트로 추가 수행 가능" : "",
  ].filter(Boolean);
  return `✓ ${targetJobName ? `${targetJobName} 수행` : "수행"} ${(summary.performed ?? 0).toLocaleString()}회 완료 (숙달 포인트 -${spent.toLocaleString()})${
    details.length > 0 ? ` · ${details.join(" · ")}` : ""
  }`;
}

export function CultivationJobSelector({
  options,
  value,
  busy,
  onChange,
}: {
  options: readonly CultivationJobOption[];
  value: string;
  busy: boolean;
  onChange: (jobId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.id === value);
  const disabled = busy || options.length === 0;

  return (
    <div className={`${SURFACE_INSET} mt-3 p-3`}>
      <p
        id="cultivation-job-select-label"
        className="text-xs font-semibold text-zinc-700 dark:text-zinc-200"
      >
        수행 성장 직업
      </p>
      <button
        type="button"
        disabled={disabled}
        aria-busy={busy}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-labelledby="cultivation-job-select-label cultivation-job-select-value"
        onClick={() => setOpen(true)}
        className={`${SURFACE_CARD} mt-2 flex min-h-14 w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:border-amber-300 disabled:opacity-50 dark:hover:border-amber-700`}
      >
        <span id="cultivation-job-select-value" className="min-w-0">
          <span className="block truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {selected?.name || "선택 가능한 직업 없음"}
          </span>
          <span className="mt-0.5 block text-xs text-zinc-600 dark:text-zinc-300">
            {selected?.summary || "수행 성장 정보 없음"}
          </span>
        </span>
        <CaretDown
          size={18}
          weight="bold"
          aria-hidden
          className="shrink-0 text-zinc-500 dark:text-zinc-400"
        />
      </button>
      <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
        전직한 적이 있는 전투직만 선택할 수 있습니다.
      </p>
      {open ? (
        <CultivationJobPickerDialog
          options={options}
          value={value}
          busy={busy}
          onChange={onChange}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}

export function CultivationJobPickerDialog({
  options,
  value,
  busy,
  onChange,
  onClose,
}: {
  options: readonly CultivationJobOption[];
  value: string;
  busy: boolean;
  onChange: (jobId: string) => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pendingValue, setPendingValue] = useState(() =>
    options.some((option) => option.id === value)
      ? value
      : (options[0]?.id ?? ""),
  );
  const closeIfIdle = () => {
    if (!busy) onClose();
  };

  useEscapeKey(closeIfIdle);
  useModalA11y(panelRef);

  const confirm = () => {
    if (busy || !pendingValue) return;
    onChange(pendingValue);
    onClose();
  };

  return (
    <div
      className="ui-modal-reveal fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-3 backdrop-blur-sm sm:items-center sm:p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) closeIfIdle();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cultivation-job-picker-title"
        aria-describedby="cultivation-job-picker-description"
        className={`${SURFACE_CARD} ui-modal-panel flex max-h-[88dvh] w-full max-w-xl flex-col overflow-hidden shadow-2xl`}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-200 p-4 dark:border-zinc-700">
          <div>
            <h2
              id="cultivation-job-picker-title"
              className="text-base font-bold text-zinc-900 dark:text-zinc-100"
            >
              수행 성장 직업 선택
            </h2>
            <p
              id="cultivation-job-picker-description"
              className="mt-1 text-xs text-zinc-500 dark:text-zinc-400"
            >
              직업마다 1회 수행으로 오르는 수치를 비교해 선택하세요.
            </p>
          </div>
          <button
            type="button"
            onClick={closeIfIdle}
            disabled={busy}
            aria-label="수행 성장 직업 선택 닫기"
            className="flex size-9 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 disabled:opacity-50 dark:hover:bg-zinc-800"
          >
            <X size={18} weight="bold" aria-hidden />
          </button>
        </div>

        <div
          role="radiogroup"
          aria-label="수행 성장 직업"
          className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 sm:grid sm:grid-cols-2 sm:content-start sm:gap-2 sm:space-y-0 sm:p-4"
        >
          {options.map((option) => {
            const checked = option.id === pendingValue;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={checked}
                disabled={busy}
                onClick={() => setPendingValue(option.id)}
                className={`${checked ? SURFACE_ACCENT : SURFACE_INSET} flex min-h-16 w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:border-amber-300 disabled:opacity-50 dark:hover:border-amber-700`}
              >
                <span
                  className={`flex size-6 shrink-0 items-center justify-center rounded-full border ${
                    checked
                      ? "border-amber-600 bg-amber-600 text-white dark:border-amber-400 dark:bg-amber-400 dark:text-zinc-950"
                      : "border-zinc-300 bg-white text-transparent dark:border-zinc-600 dark:bg-zinc-950"
                  }`}
                  aria-hidden
                >
                  <Check size={14} weight="bold" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    {option.name}
                  </span>
                  <span className="mt-1 block text-xs text-zinc-600 dark:text-zinc-300">
                    {option.summary}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-zinc-200 bg-white px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] dark:border-zinc-700 dark:bg-zinc-900">
          <Button size="md" disabled={busy} onClick={closeIfIdle}>
            취소
          </Button>
          <Button
            size="md"
            variant="primary"
            disabled={busy || !pendingValue}
            onClick={confirm}
          >
            선택 완료
          </Button>
        </div>
      </div>
    </div>
  );
}

export function CultivationActions({
  canCultivate,
  busy,
  isLifestyleJob,
  onCultivate,
  onCultivateMax,
}: {
  canCultivate: boolean;
  busy: boolean;
  isLifestyleJob: boolean;
  onCultivate: () => void;
  onCultivateMax: () => void;
}) {
  const [maxConfirmOpen, setMaxConfirmOpen] = useState(false);

  return (
    <>
      <div className="grid w-full shrink-0 grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-2 sm:w-auto sm:grid-cols-[5.5rem_10rem]">
        <Button
          onClick={onCultivate}
          disabled={!canCultivate}
          aria-busy={busy}
          title={
            isLifestyleJob ? "생활직은 수행할 수 없습니다." : undefined
          }
          variant="success"
          size="md"
          fullWidth
        >
          {isLifestyleJob ? "수행 불가" : "수행"}
        </Button>
        <Button
          onClick={() => setMaxConfirmOpen(true)}
          disabled={!canCultivate}
          aria-busy={busy}
          aria-haspopup="dialog"
          title={
            isLifestyleJob ? "생활직은 수행할 수 없습니다." : undefined
          }
          variant="primary"
          size="md"
          fullWidth
        >
          가능한 만큼 수행
        </Button>
      </div>

      {maxConfirmOpen ? (
        <CultivationMaxConfirmDialog
          busy={busy}
          onClose={() => setMaxConfirmOpen(false)}
          onConfirm={() => {
            setMaxConfirmOpen(false);
            onCultivateMax();
          }}
        />
      ) : null}
    </>
  );
}

export function CultivationMaxConfirmDialog({
  busy,
  onConfirm,
  onClose,
}: {
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeIfIdle = () => {
    if (!busy) onClose();
  };
  useEscapeKey(closeIfIdle);
  useModalA11y(panelRef);

  return (
    <div
      className="ui-modal-reveal fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) closeIfIdle();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cultivation-max-confirm-title"
        aria-describedby="cultivation-max-confirm-description"
        className={`${SURFACE_CARD} ui-modal-panel w-full max-w-sm p-5 shadow-2xl`}
      >
        <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">
          일괄 수행 확인
        </p>
        <h2
          id="cultivation-max-confirm-title"
          className="mt-1 text-lg font-bold"
        >
          가능한 만큼 한 번에 수행할까요?
        </h2>
        <p
          id="cultivation-max-confirm-description"
          className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300"
        >
          현재 보유한 숙달 포인트로 가능한 수행을 한 번에 진행합니다. 실행 전에
          선택을 다시 확인해 주세요.
        </p>
        <div className={`${SURFACE_INSET} mt-4 p-3 text-sm text-zinc-600 dark:text-zinc-300`}>
          1회만 수행하려면 취소한 뒤 기존 수행 버튼을 눌러 주세요.
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button size="md" disabled={busy} onClick={onClose}>
            취소
          </Button>
          <Button
            size="md"
            variant="primary"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? "수행 중…" : "가능한 만큼 수행 확정"}
          </Button>
        </div>
      </div>
    </div>
  );
}
