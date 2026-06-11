"use client";

import { useEffect, useState } from "react";
import { MAX_STAMINA, applyRegen, type StaminaState } from "./stamina";

// 스태미너 표시 바.
// state 자체는 DB save 시점 (사냥/회복 시) 에만 변경. 화면 표시값은 1초마다
// applyRegen 으로 계산해 회복 진행을 라이브로 보임 (DB write 없이).
export function StaminaBar({
  state,
  max = MAX_STAMINA,
}: {
  state: StaminaState;
  // per-user 최대치(한계의 비약 보너스 반영) — 미전달이면 기본 캡.
  max?: number;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const display = applyRegen(state, now, max);
  const pct = Math.max(0, Math.min(100, (display.current / max) * 100));

  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50/90 px-4 py-3 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/90">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-zinc-500 dark:text-zinc-400">스태미너</span>
        <span className="font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
          {display.current} / {max}
        </span>
      </div>
      <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div
          className="h-full bg-amber-500 transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
