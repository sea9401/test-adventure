"use client";

import {
  enhanceCatalystUsable,
  enhanceOutcomeRow,
  type EnhanceChoice,
} from "@/adventure/data/v2/v2Enhance";
import { SURFACE_INSET } from "@/components/ui/surfaces";

// 강화 화면의 "단련 촉매 사용" 선택 — 보유 촉매가 있을 때만 보인다.
// 하락 확률이 있는 시도에서만 켤 수 있고, 켜면 하락 확률 변화를 함께 보여 준다.
export function EnhanceCatalystToggle({
  level,
  stone,
  held,
  checked,
  onChange,
}: {
  level: number;
  stone: EnhanceChoice;
  held: number;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  if (held <= 0) return null;
  const usable = enhanceCatalystUsable(level, stone);
  const before = enhanceOutcomeRow(level, stone)[2];
  const after = enhanceOutcomeRow(level, stone, { catalyst: true })[2];
  return (
    <label className={`${SURFACE_INSET} flex min-h-10 items-center gap-2 px-3 py-2 text-sm`}>
      <input
        type="checkbox"
        className="size-4 shrink-0"
        checked={checked && usable}
        disabled={!usable}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="min-w-0 flex-1">
        <span className="font-semibold text-zinc-900 dark:text-zinc-100">단련 촉매 사용</span>
        <span className="text-zinc-500 dark:text-zinc-400"> · 보유 {held}</span>
        <span className="block text-xs text-zinc-500 dark:text-zinc-400">
          {usable
            ? `하락 ${before}% → ${after}% · 시도마다 1개 사용`
            : "이 단계는 하락하지 않아 쓸 필요가 없습니다"}
        </span>
      </span>
    </label>
  );
}
