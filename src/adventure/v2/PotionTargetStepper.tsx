"use client";

import { useRef } from "react";
import { Minus, Plus } from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";

const STEP = 5;
const MIN_ENABLED = STEP;
const MAX = 100;
// 처음부터 꺼져 있던 목표를 켤 때 시작값(기본 설정과 같은 만피·만마나).
const DEFAULT_ENABLED = 100;

type PotionTargetStepperProps = {
  id: string;
  label: string;
  // 표시 단위 접두어("체력"/"마나").
  unit: string;
  value: number;
  onChange: (value: number) => void;
  valueClassName?: string;
};

// 충전약 사용 목표(0=사용 안 함, 5~100%). 슬라이더는 모바일에서 스크롤하다 손가락만 닿아도
// 값이 바뀌어 충전약이 의도치 않게 소모됐다(건의 #767). 스크롤 중에는 눌리지 않는 버튼으로만 바꾼다.
export function PotionTargetStepper({
  id,
  label,
  unit,
  value,
  onChange,
  valueClassName = "",
}: PotionTargetStepperProps) {
  const disabled = value === 0;
  // 사용 안 함을 풀 때 되돌릴 마지막 목표.
  const lastEnabledRef = useRef(disabled ? DEFAULT_ENABLED : value);

  const lower = Math.max(MIN_ENABLED, Math.ceil(value / STEP) * STEP - STEP);
  const higher = Math.min(MAX, Math.floor(value / STEP) * STEP + STEP);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span id={`${id}-label`} className="text-sm font-medium">
          {label}
        </span>
        <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
          <input
            type="checkbox"
            checked={disabled}
            onChange={(e) => {
              if (e.target.checked) {
                lastEnabledRef.current = value;
                onChange(0);
              } else {
                onChange(lastEnabledRef.current);
              }
            }}
            className="size-4 accent-emerald-600"
          />
          사용 안 함
        </label>
      </div>
      <div
        role="group"
        aria-labelledby={`${id}-label`}
        className="flex items-center gap-2"
      >
        <Button
          size="icon"
          aria-label={`${label} 낮추기`}
          disabled={disabled || value <= MIN_ENABLED}
          onClick={() => onChange(lower)}
        >
          <Minus size={16} weight="bold" aria-hidden />
        </Button>
        <output
          id={id}
          aria-live="polite"
          className={`flex-1 text-center text-sm font-semibold tabular-nums ${
            disabled ? "text-zinc-500 dark:text-zinc-400" : valueClassName
          }`}
        >
          {disabled ? "사용 안 함" : `${unit} ${value}%`}
        </output>
        <Button
          size="icon"
          aria-label={`${label} 높이기`}
          disabled={disabled || value >= MAX}
          onClick={() => onChange(higher)}
        >
          <Plus size={16} weight="bold" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
