"use client";

import { useEffect, useState } from "react";
import { MAX_STAMINA, applyRegen, type StaminaState } from "./stamina";

// 스태미너 표시 바.
// state 자체는 DB save 시점 (사냥/회복 시) 에만 변경. 화면 표시값은 1초마다
// applyRegen 으로 계산해 회복 진행을 라이브로 보임 (DB write 없이).
export function StaminaBar({
  state,
  max = MAX_STAMINA,
  potions = 0,
  onUsePotion,
}: {
  state: StaminaState;
  // per-user 최대치(한계의 비약 보너스 반영) — 미전달이면 기본 캡.
  max?: number;
  // 보유 스태미나 포션 수 + 사용 핸들러. 0이거나 미전달이면 + 버튼 숨김.
  //   인벤토리 사용과 별개로, 바 끝의 작은 + 버튼으로 즉시 사용(컴팩트).
  potions?: number;
  onUsePotion?: () => Promise<void> | void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [using, setUsing] = useState(false);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const display = applyRegen(state, now, max);
  const pct = Math.max(0, Math.min(100, (display.current / max) * 100));

  const handleUse = async () => {
    if (!onUsePotion || using) return;
    setUsing(true);
    try {
      await onUsePotion();
    } finally {
      setUsing(false);
    }
  };

  const showPotionButton = potions > 0 && !!onUsePotion;

  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50/90 px-4 py-3 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/90">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-zinc-500 dark:text-zinc-400">스태미너</span>
        <span className="font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
          {display.current} / {max}
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <div className="h-3 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
          <div
            className="h-full bg-amber-500 transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        {showPotionButton && (
          // 바 끝 컴팩트 + 버튼 — 스태미나 포션 즉시 사용(보유 수 표시). 인벤토리 사용과 병행.
          <button
            type="button"
            onClick={handleUse}
            disabled={using}
            title={`스태미나 포션 사용 (${potions}개 보유)`}
            aria-label={`스태미나 포션 사용 (${potions}개 보유)`}
            className="flex h-6 shrink-0 items-center gap-0.5 rounded-md border border-amber-500 bg-amber-100 px-1.5 text-xs font-bold leading-none text-amber-800 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-600 dark:bg-amber-900/50 dark:text-amber-200 dark:hover:bg-amber-800/60"
          >
            <span aria-hidden>{using ? "…" : "＋"}</span>
            <span className="tabular-nums">{potions}</span>
          </button>
        )}
      </div>
    </div>
  );
}
