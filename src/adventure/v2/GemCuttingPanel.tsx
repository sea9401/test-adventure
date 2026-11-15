"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { StatusBanner } from "@/components/ui/StatusBanner";
import { SURFACE_CARD } from "@/components/ui/surfaces";
import {
  CUT_GEMS,
  CUT_GEM_GRADES,
  GEM_CUT_BATCH_LIMIT,
  GEM_CUT_CHANCES,
  GEM_CUT_MASTER_ALLOY_COST,
  GEM_CUT_REQUIRED_MINING_LEVEL,
  GEM_CUT_ROUGH_COST,
  LIBERATION_LOCK_GOLD_PER_LINE,
  type GemCutMode,
} from "./gemCutting";
import {
  fetchGemCuttingView,
  gemCutResultText,
  gemCuttingErrorLabel,
  requestGemCut,
  type GemCuttingView,
} from "./gemCuttingClient";
import { LIFE_MAJOR_CRAFT_MIN_STAGE } from "./lifeMajorRules";

const MODES: ReadonlyArray<{ mode: GemCutMode; label: string }> = [
  { mode: "normal", label: "일반 세공" },
  { mode: "master", label: "명장 세공" },
];

function chanceText(mode: GemCutMode): string {
  const chances = GEM_CUT_CHANCES[mode];
  return `다듬은 ${chances.polished}% · 정교한 ${chances.refined}% · 완벽한 ${chances.flawless}%`;
}

function maxCount(view: GemCuttingView, mode: GemCutMode): number {
  const byRough = Math.floor(view.roughGems / GEM_CUT_ROUGH_COST);
  const byAlloy =
    mode === "master" ? Math.floor(view.masterAlloy / GEM_CUT_MASTER_ALLOY_COST) : Number.MAX_SAFE_INTEGER;
  return Math.max(0, Math.min(GEM_CUT_BATCH_LIMIT, byRough, byAlloy));
}

// 생활 공방의 "보석 세공" 탭 — 원석 보석을 깎아 세공 보석을 만든다. 등급은 무작위다.
export function GemCuttingPanel({ onChanged }: { onChanged?: () => void }) {
  const [view, setView] = useState<GemCuttingView | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [quantity, setQuantity] = useState<Record<GemCutMode, number>>({ normal: 1, master: 1 });
  const [busyMode, setBusyMode] = useState<GemCutMode | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchGemCuttingView().then((next) => {
      if (cancelled) return;
      if (next) setView(next);
      else setLoadFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loadFailed) {
    return (
      <section className={`${SURFACE_CARD} p-3 text-sm text-zinc-600 dark:text-zinc-300`}>
        보석 세공 정보를 불러오지 못했습니다.
      </section>
    );
  }
  if (!view) return null;

  const levelLocked = view.miningLevel < GEM_CUT_REQUIRED_MINING_LEVEL;

  const cut = async (mode: GemCutMode) => {
    const amount = Math.max(1, Math.min(maxCount(view, mode), quantity[mode]));
    setNotice(null);
    setBusyMode(mode);
    const response = await requestGemCut(mode, amount);
    setBusyMode(null);
    if (!response.ok) {
      setNotice({ tone: "error", text: gemCuttingErrorLabel(response.error) });
      return;
    }
    setView(response.view);
    setNotice({
      tone: "success",
      text: `${amount.toLocaleString("ko-KR")}개 세공: ${gemCutResultText(response.results)}`,
    });
    onChanged?.();
  };

  return (
    <section className={`${SURFACE_CARD} p-3`} aria-labelledby="gem-cutting-title">
      <h2 id="gem-cutting-title" className="font-bold text-zinc-900 dark:text-zinc-100">
        보석 세공
      </h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
        원석 보석을 깎아 세공 보석을 만듭니다. 세공 보석은 대장간에서 다시 마법부여할 때 남길 줄을
        고정하는 데 씁니다(줄 하나에 보석 1개와 {LIBERATION_LOCK_GOLD_PER_LINE.toLocaleString("ko-KR")} 골드).
      </p>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-zinc-200 pt-3 text-xs tabular-nums text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">
        <span className="font-semibold text-zinc-900 dark:text-zinc-100">
          원석 보석 {view.roughGems.toLocaleString("ko-KR")}
        </span>
        <span>명장 합금 {view.masterAlloy.toLocaleString("ko-KR")}</span>
        {CUT_GEM_GRADES.map((grade) => (
          <span key={grade}>
            {CUT_GEMS[grade].name} {view.cutGems[grade].toLocaleString("ko-KR")}
          </span>
        ))}
      </div>

      {levelLocked ? (
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
          채광 Lv.{GEM_CUT_REQUIRED_MINING_LEVEL}부터 세공할 수 있습니다. 지금 Lv.{view.miningLevel}입니다.
        </p>
      ) : null}

      {notice ? (
        <StatusBanner tone={notice.tone} className="mt-3">
          {notice.text}
        </StatusBanner>
      ) : null}

      <ul className="mt-3 divide-y divide-zinc-200 border-t border-zinc-200 dark:divide-zinc-700 dark:border-zinc-700">
        {MODES.map(({ mode, label }) => {
          const masterLocked = mode === "master" && !view.masterUnlocked;
          const max = maxCount(view, mode);
          const disabled = levelLocked || masterLocked || max < 1 || busyMode !== null;
          return (
            <li
              key={mode}
              data-testid={`gem-cut-${mode}`}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{label}</p>
                <p className="mt-0.5 text-xs tabular-nums text-zinc-600 dark:text-zinc-300">
                  {chanceText(mode)}
                </p>
                <p className="mt-0.5 text-xs tabular-nums text-zinc-600 dark:text-zinc-300">
                  {mode === "master"
                    ? `1개에 원석 보석 ${GEM_CUT_ROUGH_COST}, 명장 합금 ${GEM_CUT_MASTER_ALLOY_COST}`
                    : `1개에 원석 보석 ${GEM_CUT_ROUGH_COST}`}
                </p>
                {masterLocked ? (
                  <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-300">
                    채광 주전공 명장 {LIFE_MAJOR_CRAFT_MIN_STAGE}단계부터 할 수 있습니다.
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  aria-label={`${label} 수량`}
                  min={1}
                  max={Math.max(1, max)}
                  value={Math.min(quantity[mode], Math.max(1, max))}
                  disabled={disabled}
                  onChange={(event) =>
                    setQuantity((current) => ({
                      ...current,
                      [mode]: Math.max(
                        1,
                        Math.min(Math.max(1, max), Math.floor(Number(event.target.value) || 1)),
                      ),
                    }))
                  }
                  className="min-h-10 w-16 rounded-md border border-zinc-300 bg-white px-2 text-right text-sm tabular-nums text-zinc-900 disabled:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:disabled:text-zinc-500"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  className="min-h-10"
                  aria-label={label}
                  disabled={disabled}
                  onClick={() => void cut(mode)}
                >
                  {busyMode === mode ? "세공 중..." : "세공"}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
