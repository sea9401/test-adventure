"use client";

import { useEffect, useRef, useState } from "react";
import {
  parseUnexploredHuntMode,
  UNEXPLORED_SPECIALTY_POOLS,
  type UnexploredHuntMode,
} from "@/adventure/data/v2/unexploredSpecialtyPools";
import { V2_EQUIPMENT } from "@/adventure/data/v2/v2Equipment";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";

type SpecialtyFocusResponse = {
  ok?: boolean;
  unlocked?: boolean;
  mode?: unknown;
};

function sameMode(left: UnexploredHuntMode, right: UnexploredHuntMode): boolean {
  return left.mode === right.mode &&
    (left.mode !== "focused" ||
      (right.mode === "focused" && left.poolId === right.poolId));
}

export function UnexploredSpecialtyPanel({
  unlocked,
  initialMode,
  loadFromServer = false,
  visible = true,
  onSavingChange,
  onModeChange,
}: {
  unlocked: boolean;
  initialMode: UnexploredHuntMode;
  loadFromServer?: boolean;
  visible?: boolean;
  onSavingChange?: (saving: boolean) => void;
  onModeChange?: (mode: UnexploredHuntMode) => void;
}) {
  const [available, setAvailable] = useState(unlocked);
  const [mode, setMode] = useState<UnexploredHuntMode | null>(
    loadFromServer ? null : initialMode,
  );
  const [loading, setLoading] = useState(loadFromServer);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const requestGenerationRef = useRef(0);
  const activeControllerRef = useRef<AbortController | null>(null);
  const canSelect = available || unlocked;
  const busy = loading || saving;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestGenerationRef.current += 1;
      activeControllerRef.current?.abort();
      activeControllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    onSavingChange?.(busy);
  }, [busy, onSavingChange]);

  useEffect(() => {
    if (!loadFromServer) return;
    const controller = new AbortController();
    const generation = requestGenerationRef.current + 1;
    requestGenerationRef.current = generation;
    activeControllerRef.current?.abort();
    activeControllerRef.current = controller;
    const ownsRequest = () =>
      mountedRef.current && requestGenerationRef.current === generation;
    void fetch("/api/v2/dungeon/specialty-focus", {
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json()) as SpecialtyFocusResponse;
        if (!ownsRequest()) return;
        if (!response.ok || body.ok !== true) throw new Error("load_failed");
        setAvailable(body.unlocked === true);
        setMode(parseUnexploredHuntMode(body.mode));
      })
      .catch(() => {
        if (ownsRequest() && !controller.signal.aborted) {
          setLoadError("특화 사냥 설정을 불러오지 못했습니다. 다시 불러오거나 원하는 방식을 선택해 저장해 주세요.");
        }
      })
      .finally(() => {
        if (ownsRequest()) {
          activeControllerRef.current = null;
          setLoading(false);
        }
      });
    return () => {
      controller.abort();
      if (requestGenerationRef.current === generation) {
        requestGenerationRef.current += 1;
        activeControllerRef.current = null;
      }
    };
  }, [loadAttempt, loadFromServer]);

  async function select(next: UnexploredHuntMode) {
    if (!canSelect || loading || saving || (mode && sameMode(mode, next))) return;
    const controller = new AbortController();
    const generation = requestGenerationRef.current + 1;
    requestGenerationRef.current = generation;
    activeControllerRef.current?.abort();
    activeControllerRef.current = controller;
    const ownsRequest = () =>
      mountedRef.current && requestGenerationRef.current === generation;
    setSaving(true);
    setLoadError(null);
    setSaveError(null);
    try {
      const response = await fetch("/api/v2/dungeon/specialty-focus", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(next),
        signal: controller.signal,
      });
      const body = (await response.json()) as SpecialtyFocusResponse;
      if (!ownsRequest()) return;
      if (!response.ok || body.ok !== true) throw new Error("save_failed");
      const saved = parseUnexploredHuntMode(body.mode ?? next);
      setMode(saved);
      onModeChange?.(saved);
    } catch {
      if (ownsRequest() && !controller.signal.aborted) {
        setSaveError("특화 사냥 설정을 저장하지 못했습니다. 기존 선택을 유지합니다.");
      }
    } finally {
      if (ownsRequest()) {
        activeControllerRef.current = null;
        setSaving(false);
      }
    }
  }

  function retryLoad() {
    setLoading(true);
    setMode(null);
    setLoadError(null);
    setLoadAttempt((attempt) => attempt + 1);
  }

  const disabled = !canSelect || loading || saving;

  if (!visible) return null;

  return (
    <section className={`${SURFACE_CARD} space-y-3 p-4`} aria-labelledby="unexplored-specialty-title">
      <div>
        <h2 id="unexplored-specialty-title" className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
          미개척지 특화 사냥
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
          별의 무덤에서 만날 몬스터 풀을 고릅니다. 전용 장비 확률은 최종 확률이며 다른 배율이 적용되지 않습니다.
        </p>
        {!canSelect ? (
          <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-300">
            깊이 79를 개척하면 특화 사냥을 선택할 수 있습니다.
          </p>
        ) : null}
      </div>

      <fieldset role="radiogroup" aria-label="미개척지 특화 사냥" disabled={disabled} className="space-y-3">
        <legend className="sr-only">사냥 방식 선택</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className={`${SURFACE_INSET} flex cursor-pointer items-start gap-2 p-3 text-sm text-zinc-800 dark:text-zinc-100`}>
            <input
              type="radio"
              name="unexplored-specialty-mode"
              checked={mode?.mode === "standard"}
              onChange={() => void select({ mode: "standard" })}
              className="mt-0.5 size-4 accent-emerald-600"
            />
            <span><span className="block font-semibold">일반 사냥</span><span className="text-xs text-zinc-500 dark:text-zinc-400">기존 별의 무덤 몬스터와 드롭</span></span>
          </label>
          <label className={`${SURFACE_INSET} flex cursor-pointer items-start gap-2 p-3 text-sm text-zinc-800 dark:text-zinc-100`}>
            <input
              type="radio"
              name="unexplored-specialty-mode"
              checked={mode?.mode === "random"}
              onChange={() => void select({ mode: "random" })}
              className="mt-0.5 size-4 accent-emerald-600"
            />
            <span><span className="block font-semibold">무작위 특화 · 전용 장비 0.4%</span><span className="text-xs text-zinc-500 dark:text-zinc-400">12개 풀 중 하나를 매 전투 무작위 선택</span></span>
          </label>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {UNEXPLORED_SPECIALTY_POOLS.map((pool) => (
            <label
              key={pool.id}
              data-specialty-card={pool.id}
              className={`${SURFACE_INSET} cursor-pointer p-3 text-zinc-800 dark:text-zinc-100`}
            >
              <span className="flex items-start gap-2">
                <input
                  type="radio"
                  name="unexplored-specialty-mode"
                  checked={mode?.mode === "focused" && mode.poolId === pool.id}
                  onChange={() => void select({ mode: "focused", poolId: pool.id })}
                  className="mt-0.5 size-4 shrink-0 accent-emerald-600"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{pool.name} 집중 · 전용 장비 0.6%</span>
                  <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">{pool.combatStyle}</span>
                </span>
              </span>
              <ul className="mt-2 space-y-1 border-t border-zinc-200 pt-2 text-[11px] dark:border-zinc-700">
                {pool.monsters.map((monster) => (
                  <li key={monster.id} className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-zinc-600 dark:text-zinc-300">{monster.name}</span>
                    <span className="shrink-0 font-medium text-emerald-700 dark:text-emerald-300">{V2_EQUIPMENT[monster.equipmentId].name}</span>
                  </li>
                ))}
              </ul>
            </label>
          ))}
        </div>
      </fieldset>

      {saving ? <p role="status" className="text-xs text-sky-700 dark:text-sky-300">특화 설정 저장 중… 사냥을 잠시 기다려 주세요.</p> : null}
      {loadError ? (
        <div className={`${SURFACE_INSET} flex flex-wrap items-center justify-between gap-2 p-2.5`}>
          <p role="alert" className="text-xs font-medium text-rose-700 dark:text-rose-300">{loadError}</p>
          <button
            type="button"
            onClick={retryLoad}
            className="ui-game-button rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            다시 불러오기
          </button>
        </div>
      ) : null}
      {saveError ? <p role="alert" className="text-xs font-medium text-rose-700 dark:text-rose-300">{saveError}</p> : null}
    </section>
  );
}
