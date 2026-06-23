"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";

// 로드아웃 프리셋 패널 — 이름 붙인 로드아웃을 저장/적용/삭제. 슬롯은 무료 고정(수집 포인트 경제
//   폐지). 적용은 POST /api/v2/me/loadout(예산/직업고정 검증 재사용) → 부모 refresh. 저장/현황은
//   /api/v2/me/loadout-presets. 데이터는 자체 fetch(코어루프 전용 — 로드아웃 패널과 나란히 렌더).

type PresetItem = { name: string; skills: string[] };
type PresetState = {
  presets: PresetItem[];
  totalSlots: number;
};

const PRESET_NAME_MAX = 24;

export function V2LoadoutPresetsPanel({
  currentEquipped,
  onApplied,
}: {
  currentEquipped: string[];
  onApplied?: () => void;
}) {
  const [state, setState] = useState<PresetState | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

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
    load();
  }, [load]);

  // 코어루프 컨텍스트가 아니면(또는 로드 실패) 렌더 안 함.
  if (!state) return null;

  async function postPresets(presets: PresetItem[]) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/v2/me/loadout-presets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "save", presets }),
      });
      const j = (await res.json().catch(() => null)) as
        | (PresetState & { ok?: boolean })
        | null;
      if (j?.ok) setState(j);
      else setMsg("저장하지 못했어요");
    } catch {
      setMsg("오류가 발생했어요");
    } finally {
      setBusy(false);
    }
  }

  async function saveCurrent() {
    if (!state) return;
    if (state.presets.length >= state.totalSlots) {
      setMsg("프리셋 슬롯이 가득 찼어요. 기존 프리셋을 지우세요.");
      return;
    }
    if (currentEquipped.length === 0) {
      setMsg("장착한 스킬이 없어요.");
      return;
    }
    const trimmed = name.trim().slice(0, PRESET_NAME_MAX);
    const next: PresetItem[] = [
      ...state.presets,
      {
        name: trimmed || `프리셋 ${state.presets.length + 1}`,
        skills: currentEquipped,
      },
    ];
    setName("");
    await postPresets(next);
  }

  async function deletePreset(idx: number) {
    if (!state) return;
    await postPresets(state.presets.filter((_, i) => i !== idx));
  }

  async function applyPreset(skills: string[]) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/v2/me/loadout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ equipped: skills }),
      });
      const j = (await res.json().catch(() => null)) as {
        ok?: boolean;
        overBudget?: boolean;
      } | null;
      if (!j?.ok) {
        setMsg(
          j?.overBudget
            ? "이 프리셋은 지금 스킬포인트 예산을 넘어요."
            : "이 프리셋을 적용할 수 없어요.",
        );
      } else {
        onApplied?.();
      }
    } catch {
      setMsg("오류가 발생했어요");
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
          {state.presets.map((p, i) => (
            <li
              // 내용 기반 안정 키(삭제 시 인덱스 시프트로 행 오식별 방지). 안정 id 가 없어
              //   name+skills 로 구성 — 완전 동일 프리셋(이름·스킬 모두 같음)만 충돌(무해).
              key={`${p.name}|${p.skills.join(",")}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="min-w-0 truncate text-sm font-semibold">
                  {p.name}
                </span>
                <span className="shrink-0 rounded bg-zinc-200/70 px-1.5 py-0.5 text-[10px] tabular-nums text-zinc-600 dark:bg-zinc-700/60 dark:text-zinc-300">
                  스킬 {p.skills.length}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => applyPreset(p.skills)}
                  disabled={busy}
                  className="rounded-md border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  적용
                </button>
                <button
                  type="button"
                  onClick={() => deletePreset(i)}
                  disabled={busy}
                  aria-label={`${p.name} 삭제`}
                  className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-500 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                >
                  삭제
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-zinc-400 dark:text-zinc-500">
          저장한 프리셋이 없어요.
        </p>
      )}

      {msg && (
        <div
          role="status"
          aria-live="polite"
          className="mt-2 rounded-md border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs text-rose-700 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-300"
        >
          {msg}
        </div>
      )}
    </Card>
  );
}
