"use client";

import { useState, type InputHTMLAttributes } from "react";

type DraftNumberInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "defaultValue" | "onChange"
> & {
  value: number;
  onValueChange: (value: number) => void;
  normalizeValue?: (value: number) => number;
};

function numericBound(value: number | string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeIntegerInput(
  value: number,
  min?: number | string,
  max?: number | string,
) {
  const lowerBound = numericBound(min, Number.NEGATIVE_INFINITY);
  const upperBound = numericBound(max, Number.POSITIVE_INFINITY);
  return Math.min(upperBound, Math.max(lowerBound, Math.floor(value)));
}

export function parseNumberDraft(raw: string): number | null {
  if (raw === "") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * 숫자 상태는 유효하게 유지하면서 입력 중에는 빈 문자열을 허용하는 정수 입력칸.
 * 값을 지운 순간 min 값이 다시 끼어들지 않으며, 포커스를 벗어날 때 범위를 보정한다.
 */
export function DraftNumberInput({
  value,
  onValueChange,
  normalizeValue,
  min,
  max,
  onBlur,
  onFocus,
  ...rest
}: DraftNumberInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const displayedValue = draft ?? String(value);
  const normalize = (next: number) =>
    normalizeValue?.(next) ?? normalizeIntegerInput(next, min, max);

  return (
    <input
      {...rest}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={displayedValue}
      onFocus={(event) => {
        try {
          event.currentTarget.select();
        } catch {}
        onFocus?.(event);
      }}
      onChange={(event) => {
        const raw = event.target.value;
        setDraft(raw);
        const parsed = parseNumberDraft(raw);
        if (parsed != null) onValueChange(normalize(parsed));
      }}
      onBlur={(event) => {
        const parsed = parseNumberDraft(displayedValue);
        if (parsed != null) onValueChange(normalize(parsed));
        setDraft(null);
        onBlur?.(event);
      }}
    />
  );
}
