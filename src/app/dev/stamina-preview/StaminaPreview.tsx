"use client";

import { useState } from "react";
import { StaminaBar } from "@/adventure/v2/StaminaBar";
import {
  MAX_STAMINA,
  REGEN_SECONDS_PER_POINT,
  staminaOverchargeCap,
  initialStamina,
  type StaminaState,
} from "@/adventure/v2/stamina";

// 다양한 스태미너 상태를 시각으로 검증하는 dev preview.
// staging 운영자가 https://test.msmsge.com/dev/stamina-preview 에서 확인.
export function StaminaPreview() {
  // 마운트 1회 스냅샷 — 렌더 중 Date.now() 직접 호출(비순수) 회피.
  const [now] = useState(() => Date.now());
  const REGEN_MS = REGEN_SECONDS_PER_POINT * 1000;

  const [scenarios] = useState<Array<{ label: string; state: StaminaState }>>(
    () => [
      { label: `만피 (${MAX_STAMINA}/${MAX_STAMINA})`, state: initialStamina(now) },
      {
        label: "0 (회복 막 시작)",
        state: { current: 0, lastUpdatedAt: now },
      },
      {
        label: "50 (회복 진행 중간)",
        state: { current: 50, lastUpdatedAt: now - REGEN_MS / 2 },
      },
      {
        label: "100 (반 채움)",
        state: { current: 100, lastUpdatedAt: now },
      },
      {
        label: "199 (1 회복 직전, 곧 만피)",
        state: { current: 199, lastUpdatedAt: now },
      },
      {
        label: `초과 비축 (${MAX_STAMINA + 2000}/${MAX_STAMINA} — 포션 overcharge)`,
        state: { current: MAX_STAMINA + 2000, lastUpdatedAt: now },
      },
      {
        label: `비축 상한 도달 (${staminaOverchargeCap(MAX_STAMINA)}/${MAX_STAMINA})`,
        state: {
          current: staminaOverchargeCap(MAX_STAMINA),
          lastUpdatedAt: now,
        },
      },
      {
        label: "옛 데이터 (1시간 전 마지막, +120 자동 회복)",
        state: { current: 100, lastUpdatedAt: now - 3600 * 1000 },
      },
    ],
  );

  return (
    <main className="mx-auto max-w-md space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <header className="space-y-1">
        <h1 className="text-lg font-bold">스태미너 미리보기</h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          MAX={MAX_STAMINA}, 회복={REGEN_SECONDS_PER_POINT}초/1. 카운트다운은
          1초마다 갱신.
        </p>
      </header>

      {scenarios.map(({ label, state }) => (
        <section key={label} className="space-y-1">
          <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            {label}
          </div>
          {/* 포션 보유 가정 → 바 끝 + 버튼/모달(개수 선택·초과 비축) 시각 검증. */}
          <StaminaBar state={state} potions={20} onUsePotion={async () => {}} />
        </section>
      ))}
    </main>
  );
}
