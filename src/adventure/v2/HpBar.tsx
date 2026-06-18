"use client";

import { useEffect, useState } from "react";
import { applyHpRegen, canHuntWithHp } from "./hpRegen";

// HP 표시 바. StaminaBar 와 같은 패턴 — state(저장 시점 hp + anchor)는 사냥/회복 시에만
// 갱신되고, 화면 표시값은 1초마다 applyHpRegen 으로 계산해 시간 재생을 라이브로 보인다
// (DB write 없음). anchorMs 는 hp 가 정확했던 시각(보통 응답 수신 시각).
export type HpBarState = {
  hp: number;
  maxHp: number;
  anchorMs: number;
};

export function HpBar({
  state,
  compact,
}: {
  state: HpBarState;
  compact?: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const maxHp = Math.max(1, state.maxHp);
  const display = applyHpRegen(state.hp, maxHp, state.anchorMs, now).hp;
  const pct = Math.max(0, Math.min(100, (display / maxHp) * 100));
  const canHunt = canHuntWithHp(display, maxHp);

  if (compact) {
    return (
      <div>
        <div className="flex items-baseline justify-between text-[11px]">
          <span className="text-zinc-500 dark:text-zinc-400">HP</span>
          <span className="font-medium tabular-nums text-zinc-700 dark:text-zinc-200">
            {display} / {maxHp}
          </span>
        </div>
        <div className="mt-0.5 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
          <div
            className={`h-full transition-[width] duration-500 ${
              canHunt ? "bg-rose-500" : "bg-rose-300 dark:bg-rose-900"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50/90 px-4 py-3 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/90">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-zinc-500 dark:text-zinc-400">체력</span>
        <span className="font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
          {display} / {maxHp}
        </span>
      </div>
      <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div
          className={`h-full transition-[width] duration-500 ${
            canHunt ? "bg-rose-500" : "bg-rose-300 dark:bg-rose-900"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {!canHunt && (
        <div className="mt-1.5 text-xs text-rose-600 dark:text-rose-400">
          체력이 부족해 전투할 수 없습니다 — 회복이 필요합니다.
        </div>
      )}
    </div>
  );
}
