"use client";

import {
  ArrowClockwise,
  CheckCircle,
  Trash,
  WarningCircle,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { SURFACE_INSET } from "@/components/ui/surfaces";
import {
  autoFitLoadoutPreset,
  diagnoseLoadoutPreset,
  toggleLoadoutPresetDraftSkill,
  type LoadoutPresetDiagnosis,
  type LoadoutPresetSkillMeta,
} from "./loadoutPresetDiagnostics";
import { useSystemToast } from "./RewardToastProvider";

// 로드아웃 프리셋 패널 — 이름 붙인 로드아웃을 저장/적용/덮어쓰기/삭제. 슬롯은 무료 고정(수집 포인트 경제
//   폐지). 적용은 POST /api/v2/me/loadout(예산/직업고정 검증 재사용) → 부모 refresh. 저장/현황은
//   /api/v2/me/loadout-presets. 데이터는 자체 fetch(코어루프 전용 — 로드아웃 패널과 나란히 렌더).

type PresetItem = { name: string; skills: string[] };
type PresetState = {
  presets: PresetItem[];
  totalSlots: number;
};
type Feedback = { tone: "success" | "error"; text: string };
type LoadoutApplyResponse = {
  ok?: boolean;
  overBudget?: boolean;
  spUsed?: number;
  spBudget?: number;
  notLearned?: string[];
  unknown?: string[];
};

const PRESET_NAME_MAX = 24;

export function V2LoadoutPresetsPanel({
  currentEquipped,
  spBudget,
  library,
  onApplied,
}: {
  currentEquipped: string[];
  spBudget: number;
  library: readonly LoadoutPresetSkillMeta[];
  onApplied?: () => void | Promise<void>;
}) {
  const [state, setState] = useState<PresetState | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [adjustingIndex, setAdjustingIndex] = useState<number | null>(null);
  const [draftSkills, setDraftSkills] = useState<string[]>([]);
  const [autoRemoved, setAutoRemoved] = useState<string[]>([]);
  const { notifySystem } = useSystemToast();

  const showFeedback = useCallback(
    (text: string, tone: Feedback["tone"]) => {
      setFeedback({ text, tone });
      notifySystem(text, tone);
    },
    [notifySystem],
  );

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/v2/me/loadout-presets");
      const j = (await res.json().catch(() => null)) as
        | (PresetState & { ok?: boolean })
        | null;
      if (j?.ok) setState(j);
    } catch {
      // 무시 — 패널 미표시.
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 1회 프리셋 fetch
    load();
  }, [load]);

  // 코어루프 컨텍스트가 아니면(또는 로드 실패) 렌더 안 함.
  if (!state) return null;

  async function postPresets(
    presets: PresetItem[],
    successMessage: string,
  ) {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/v2/me/loadout-presets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "save", presets }),
      });
      const j = (await res.json().catch(() => null)) as
        | (PresetState & { ok?: boolean })
        | null;
      if (j?.ok) {
        setState(j);
        showFeedback(successMessage, "success");
      } else {
        showFeedback("저장하지 못했어요.", "error");
      }
    } catch {
      showFeedback("오류가 발생했어요.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function saveCurrent() {
    if (!state) return;
    if (state.presets.length >= state.totalSlots) {
      showFeedback(
        "프리셋 슬롯이 가득 찼어요. 기존 프리셋을 지우세요.",
        "error",
      );
      return;
    }
    if (currentEquipped.length === 0) {
      showFeedback("장착한 스킬이 없어요.", "error");
      return;
    }
    const trimmed = name.trim().slice(0, PRESET_NAME_MAX);
    const presetName = trimmed || `프리셋 ${state.presets.length + 1}`;
    const next: PresetItem[] = [
      ...state.presets,
      {
        name: presetName,
        skills: [...currentEquipped],
      },
    ];
    setName("");
    await postPresets(next, `'${presetName}' 프리셋을 저장했어요.`);
  }

  async function deletePreset(idx: number) {
    if (!state) return;
    const preset = state.presets[idx];
    if (!preset) return;
    await postPresets(
      state.presets.filter((_, i) => i !== idx),
      `'${preset.name}' 프리셋을 삭제했어요.`,
    );
  }

  async function overwritePreset(idx: number) {
    if (!state) return;
    if (currentEquipped.length === 0) {
      showFeedback("장착한 스킬이 없어요.", "error");
      return;
    }
    const preset = state.presets[idx];
    if (!preset) return;
    await postPresets(
      state.presets.map((item, i) =>
        i === idx ? { ...item, skills: [...currentEquipped] } : item,
      ),
      `'${preset.name}' 프리셋을 현재 스킬로 덮어썼어요.`,
    );
  }

  async function applyPreset(preset: PresetItem) {
    const diagnosis = diagnoseLoadoutPreset(preset.skills, library, spBudget);
    if (!diagnosis.canApply) {
      const index = state?.presets.indexOf(preset) ?? -1;
      if (index >= 0) openAdjustment(index);
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/v2/me/loadout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ equipped: preset.skills }),
      });
      const j = (await res.json().catch(() => null)) as LoadoutApplyResponse | null;
      if (!j?.ok) {
        showFeedback(loadoutApplyError(j, preset.skills, library, spBudget), "error");
      } else {
        showFeedback(`'${preset.name}' 프리셋을 적용했어요.`, "success");
        await onApplied?.();
      }
    } catch {
      showFeedback("오류가 발생했어요.", "error");
    } finally {
      setBusy(false);
    }
  }

  function openAdjustment(index: number) {
    const preset = state?.presets[index];
    if (!preset) return;
    setAdjustingIndex(index);
    setDraftSkills([...preset.skills]);
    setAutoRemoved([]);
    setFeedback(null);
  }

  function closeAdjustment() {
    setAdjustingIndex(null);
    setDraftSkills([]);
    setAutoRemoved([]);
  }

  function toggleDraftSkill(skillId: string) {
    if (adjustingIndex == null) return;
    const preset = state?.presets[adjustingIndex];
    if (!preset) return;
    setDraftSkills(
      toggleLoadoutPresetDraftSkill(preset.skills, draftSkills, skillId),
    );
    setAutoRemoved([]);
  }

  function autoFitDraft() {
    if (adjustingIndex == null) return;
    const preset = state?.presets[adjustingIndex];
    if (!preset) return;
    const fitted = autoFitLoadoutPreset(preset.skills, library, spBudget);
    setDraftSkills(fitted.skills);
    setAutoRemoved(fitted.removed);
  }

  async function applyAdjustedPreset(saveAfterApply: boolean) {
    if (adjustingIndex == null || !state) return;
    const preset = state.presets[adjustingIndex];
    if (!preset) return;
    const diagnosis = diagnoseLoadoutPreset(draftSkills, library, spBudget);
    if (!diagnosis.canApply || draftSkills.length === 0) return;

    setBusy(true);
    setFeedback(null);
    try {
      const applyResponse = await fetch("/api/v2/me/loadout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ equipped: draftSkills }),
      });
      const applied = (await applyResponse.json().catch(() => null)) as
        | LoadoutApplyResponse
        | null;
      if (!applied?.ok) {
        showFeedback(
          loadoutApplyError(applied, draftSkills, library, spBudget),
          "error",
        );
        return;
      }

      await onApplied?.();
      if (!saveAfterApply) {
        showFeedback(`'${preset.name}' 조정 구성을 적용했어요.`, "success");
        closeAdjustment();
        return;
      }

      const nextPresets = state.presets.map((item, index) =>
        index === adjustingIndex ? { ...item, skills: [...draftSkills] } : item,
      );
      const saveResponse = await fetch("/api/v2/me/loadout-presets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "save", presets: nextPresets }),
      });
      const saved = (await saveResponse.json().catch(() => null)) as
        | (PresetState & { ok?: boolean })
        | null;
      if (!saved?.ok) {
        showFeedback(
          "조정 구성은 적용했지만 프리셋에는 저장하지 못했어요.",
          "error",
        );
        return;
      }
      setState(saved);
      showFeedback(`'${preset.name}' 조정 구성을 적용하고 저장했어요.`, "success");
      closeAdjustment();
    } catch {
      showFeedback("오류가 발생했어요.", "error");
    } finally {
      setBusy(false);
    }
  }

  const slotsFull = state.presets.length >= state.totalSlots;

  return (
    <Card padding="md">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">스킬 프리셋</h2>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          슬롯{" "}
          <strong className="tabular-nums">
            {state.presets.length}/{state.totalSlots}
          </strong>
        </span>
      </div>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        지금 장착한 스킬을 프리셋으로 저장해 두면 한 번에 불러올 수 있어요.
      </p>

      {/* 현재 스킬 저장 */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={PRESET_NAME_MAX}
          placeholder="프리셋 이름"
          disabled={busy || slotsFull}
          className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
        <button
          type="button"
          onClick={saveCurrent}
          disabled={busy || slotsFull}
          className="shrink-0 rounded-md border border-teal-600 bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          현재 스킬 저장
        </button>
      </div>

      {/* 프리셋 목록 */}
      {state.presets.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {state.presets.map((p, i) => {
            const diagnosis = diagnoseLoadoutPreset(p.skills, library, spBudget);
            const adjustmentOpen = adjustingIndex === i;
            const draftDiagnosis = adjustmentOpen
              ? diagnoseLoadoutPreset(draftSkills, library, spBudget)
              : null;
            return (
            <li
              // 내용 기반 안정 키(삭제 시 인덱스 시프트로 행 오식별 방지). 안정 id 가 없어
              //   name+skills 로 구성 — 완전 동일 프리셋(이름·스킬 모두 같음)만 충돌(무해).
              key={`${p.name}|${p.skills.join(",")}`}
              className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 truncate text-sm font-semibold">
                      {p.name}
                    </span>
                    <span className="shrink-0 rounded bg-zinc-200/70 px-1.5 py-0.5 text-[10px] tabular-nums text-zinc-600 dark:bg-zinc-700/60 dark:text-zinc-300">
                      스킬 {p.skills.length}
                    </span>
                  </div>
                  <LoadoutPresetSpStatus diagnosis={diagnosis} />
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      diagnosis.canApply ? applyPreset(p) : openAdjustment(i)
                    }
                    disabled={busy}
                    className={`rounded-md border px-3 py-1.5 text-xs font-medium text-white transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${
                      diagnosis.canApply
                        ? "border-emerald-600 bg-emerald-600 hover:bg-emerald-700"
                        : "border-amber-600 bg-amber-600 hover:bg-amber-700"
                    }`}
                  >
                    {diagnosis.canApply ? "적용" : "조정"}
                  </button>
                  <button
                    type="button"
                    onClick={() => overwritePreset(i)}
                    disabled={busy}
                    aria-label={`${p.name} 프리셋을 현재 스킬로 덮어쓰기`}
                    title="현재 스킬로 덮어쓰기"
                    className="inline-flex size-8 items-center justify-center rounded-md border border-amber-500 text-amber-700 transition hover:bg-amber-50 active:scale-90 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-600 dark:text-amber-300 dark:hover:bg-amber-950"
                  >
                    <ArrowClockwise size={16} weight="bold" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => deletePreset(i)}
                    disabled={busy}
                    aria-label={`${p.name} 프리셋 삭제`}
                    title="프리셋 삭제"
                    className="inline-flex size-8 items-center justify-center rounded-md border border-rose-300 text-rose-600 transition hover:bg-rose-50 active:scale-90 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-800 dark:text-rose-400 dark:hover:bg-rose-950"
                  >
                    <Trash size={16} weight="bold" aria-hidden="true" />
                  </button>
                </div>
              </div>
              {adjustmentOpen && draftDiagnosis && (
                <div className="mt-2">
                  <LoadoutPresetAdjustment
                    savedDiagnosis={diagnosis}
                    draftDiagnosis={draftDiagnosis}
                    draftSkills={draftSkills}
                    autoRemoved={autoRemoved}
                    busy={busy}
                    onToggleSkill={toggleDraftSkill}
                    onAutoFit={autoFitDraft}
                    onApply={() => applyAdjustedPreset(false)}
                    onApplyAndSave={() => applyAdjustedPreset(true)}
                    onClose={closeAdjustment}
                  />
                </div>
              )}
            </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-zinc-400 dark:text-zinc-500">
          저장한 프리셋이 없어요.
        </p>
      )}

      {feedback && (
        <div
          role="status"
          aria-live="polite"
          className={`mt-2 flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-medium ${
            feedback.tone === "success"
              ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
              : "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-300"
          }`}
        >
          {feedback.tone === "success" ? (
            <CheckCircle size={16} weight="fill" aria-hidden="true" />
          ) : (
            <WarningCircle size={16} weight="fill" aria-hidden="true" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}
    </Card>
  );
}

export function LoadoutPresetSpStatus({
  diagnosis,
}: {
  diagnosis: LoadoutPresetDiagnosis;
}) {
  const invalidCount = diagnosis.rows.filter(
    (row) => row.status !== "learned",
  ).length;
  const suffix = diagnosis.overBy > 0
    ? `${diagnosis.overBy.toLocaleString("ko-KR")} SP 초과`
    : invalidCount > 0
      ? `확인 필요 ${invalidCount}개`
      : "적용 가능";
  return (
    <p
      className={`mt-1 text-[11px] tabular-nums ${
        diagnosis.canApply
          ? "text-zinc-500 dark:text-zinc-400"
          : "font-medium text-amber-700 dark:text-amber-300"
      }`}
    >
      {`필요 SP ${diagnosis.spUsed.toLocaleString("ko-KR")} / 보유 SP ${diagnosis.spBudget.toLocaleString("ko-KR")} · ${suffix}`}
    </p>
  );
}

export function LoadoutPresetAdjustment({
  savedDiagnosis,
  draftDiagnosis,
  draftSkills,
  autoRemoved,
  busy,
  onToggleSkill,
  onAutoFit,
  onApply,
  onApplyAndSave,
  onClose,
}: {
  savedDiagnosis: LoadoutPresetDiagnosis;
  draftDiagnosis: LoadoutPresetDiagnosis;
  draftSkills: readonly string[];
  autoRemoved: readonly string[];
  busy: boolean;
  onToggleSkill: (skillId: string) => void;
  onAutoFit: () => void;
  onApply: () => void;
  onApplyAndSave: () => void;
  onClose?: () => void;
}) {
  const selected = new Set(draftSkills);
  const rowById = new Map(
    savedDiagnosis.rows.map((row) => [row.skillId, row]),
  );
  const canSubmit =
    !busy && draftSkills.length > 0 && draftDiagnosis.canApply;

  return (
    <div className={`${SURFACE_INSET} space-y-3 p-3`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-100">
            프리셋 조정
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
            체크를 해제해도 원본 프리셋은 저장 버튼을 누르기 전까지 유지됩니다.
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md border border-zinc-300 px-2 py-1 text-[11px] font-medium text-zinc-600 hover:bg-white disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            닫기
          </button>
        )}
      </div>

      <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
        {savedDiagnosis.rows.map((row) => {
          const checked = selected.has(row.skillId);
          const statusLabel =
            row.status === "notLearned"
              ? "현재 미습득"
              : row.status === "unknown"
                ? "더 이상 존재하지 않는 스킬"
                : null;
          return (
            <label
              key={row.skillId}
              className="flex cursor-pointer items-center gap-2 rounded-md border border-zinc-200 bg-white px-2.5 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-900"
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={busy}
                onChange={() => onToggleSkill(row.skillId)}
                aria-label={`${row.name} 프리셋에 포함`}
                className="size-4 shrink-0 accent-emerald-600"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-zinc-800 dark:text-zinc-100">
                  {row.name}
                </span>
                {statusLabel && (
                  <span className="block text-[10px] font-medium text-rose-600 dark:text-rose-300">
                    {statusLabel}
                  </span>
                )}
              </span>
              <span className="shrink-0 tabular-nums text-zinc-500 dark:text-zinc-400">
                {row.spCost.toLocaleString("ko-KR")} SP
              </span>
            </label>
          );
        })}
      </div>

      {autoRemoved.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <strong className="block font-semibold">자동 맞춤 제외</strong>
          <ul className="mt-1 space-y-0.5">
            {autoRemoved.map((skillId) => {
              const row = rowById.get(skillId);
              return (
                <li key={skillId}>
                  {`${row?.name ?? skillId} · ${(row?.spCost ?? 0).toLocaleString("ko-KR")} SP`}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p
          className={`text-xs font-semibold tabular-nums ${
            draftDiagnosis.canApply
              ? "text-emerald-700 dark:text-emerald-300"
              : "text-rose-700 dark:text-rose-300"
          }`}
        >
          {`조정 후 ${draftDiagnosis.spUsed.toLocaleString("ko-KR")} / ${draftDiagnosis.spBudget.toLocaleString("ko-KR")} SP`}
          {draftDiagnosis.overBy > 0
            ? ` · ${draftDiagnosis.overBy.toLocaleString("ko-KR")} SP 더 줄여야 합니다.`
            : draftDiagnosis.canApply
              ? " · 적용 가능"
              : " · 미습득 또는 삭제된 스킬을 제외해 주세요."}
        </p>
        <button
          type="button"
          onClick={onAutoFit}
          disabled={busy}
          className="rounded-md border border-amber-500 px-2.5 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-950"
        >
          자동 맞춤
        </button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={onApply}
          disabled={!canSubmit}
          className="rounded-md border border-emerald-600 bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          조정한 구성으로 적용
        </button>
        <button
          type="button"
          onClick={onApplyAndSave}
          disabled={!canSubmit}
          className="rounded-md border border-violet-600 bg-violet-600 px-3 py-2 text-xs font-medium text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          적용 후 프리셋 저장
        </button>
      </div>
    </div>
  );
}

function loadoutApplyError(
  response: LoadoutApplyResponse | null,
  skills: readonly string[],
  library: readonly LoadoutPresetSkillMeta[],
  currentSpBudget: number,
): string {
  const diagnosis = diagnoseLoadoutPreset(
    skills,
    library,
    response?.spBudget ?? currentSpBudget,
  );
  const spUsed = response?.spUsed ?? diagnosis.spUsed;
  const spBudget = response?.spBudget ?? diagnosis.spBudget;
  if (response?.overBudget || spUsed > spBudget) {
    return `필요 SP ${spUsed.toLocaleString("ko-KR")} / 보유 SP ${spBudget.toLocaleString("ko-KR")} · ${(spUsed - spBudget).toLocaleString("ko-KR")} SP 초과`;
  }
  const invalidIds = new Set([
    ...(response?.notLearned ?? []),
    ...(response?.unknown ?? []),
  ]);
  const invalidNames = diagnosis.rows
    .filter(
      (row) => row.status !== "learned" || invalidIds.has(row.skillId),
    )
    .map((row) => row.name);
  return invalidNames.length > 0
    ? `적용할 수 없는 스킬: ${invalidNames.join(", ")}`
    : "이 프리셋을 적용할 수 없어요.";
}
