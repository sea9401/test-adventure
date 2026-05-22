"use client";

import { Card } from "@/components/ui/Card";
import {
  STANCE_IDS,
  STANCE_META,
  stanceEffectChips,
  type StanceEffectChip,
  type StanceId,
} from "./stance";

// 효과 칩 색 — buff(이득) 초록, penalty(손해) 빨강, neutral(보정 없음) 회색.
const CHIP_CLASS: Record<StanceEffectChip["kind"], string> = {
  buff: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  penalty: "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
  neutral: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
};

// 전투 전 전술(스탠스) 선택기. 현재 보스 진입 화면(BossSubView)에 노출.
// 선택값은 character.v2 에 전역 영속 — 한 번 고르면 전투 보정(공세/수성/처형)이
// 보스·협동·고탑·PvP 모든 특수 전투에 적용된다(고탑/PvP 진입 화면 노출은 후속).
// 노획(없음)의 드랍률·경험치 보너스는 지역 보스에만 적용. 일반 사냥엔 영향 없음.
export function StancePicker({
  value,
  onChange,
}: {
  value: StanceId | null;
  onChange: (stance: StanceId | null) => void;
}) {
  const options: Array<{
    id: StanceId | null;
    name: string;
    chips: StanceEffectChip[];
  }> = [
    { id: null, name: "노획", chips: stanceEffectChips(null) },
    ...STANCE_IDS.map((id) => ({
      id,
      name: STANCE_META[id].name,
      chips: stanceEffectChips(id),
    })),
  ];
  return (
    <Card as="section" padding="md">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          전술
        </h3>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          보스·협동·고탑·PvP 에만 적용
        </span>
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {options.map((o) => {
          const active = value === o.id;
          return (
            <button
              key={o.id ?? "none"}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(o.id)}
              className={`rounded-md border p-3 text-left transition-colors ${
                active
                  ? "border-sky-500 bg-sky-50 dark:border-sky-400 dark:bg-sky-950/40"
                  : "border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
              }`}
            >
              <div
                className={`text-sm font-medium ${
                  active
                    ? "text-sky-700 dark:text-sky-300"
                    : "text-zinc-800 dark:text-zinc-100"
                }`}
              >
                {o.name}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {o.chips.map((c) => (
                  <span
                    key={c.label}
                    className={`rounded px-1.5 py-0.5 text-xs font-medium ${CHIP_CLASS[c.kind]}`}
                  >
                    {c.label}
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
