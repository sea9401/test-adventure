"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { DraftNumberInput } from "@/components/ui/DraftNumberInput";
import { clampShopQuantity } from "./shopQuantity";

// 입력칸은 포커스가 있는 동안 입력 중인 글자를 그대로 보여 준다. 휴대폰에서는 버튼을 눌러도
// 포커스가 남을 수 있어, 값을 바깥에서 바꿀 때는 입력칸을 다시 그려 표시와 실제 수량을 맞춘다.
export function useShopQuantity(max: number) {
  const [draft, setDraft] = useState(1);
  const [inputKey, setInputKey] = useState(0);
  const replace = (next: number) => {
    setDraft(next);
    setInputKey((key) => key + 1);
  };
  return {
    quantity: clampShopQuantity(draft, max),
    inputKey,
    onType: setDraft,
    onReplace: replace,
    reset: () => replace(1),
  };
}

// 교환소 상품 행의 수량 입력칸. 2개 이상 살 수 있을 때만 그린다.
export function ShopQuantityControl({
  name,
  max,
  disabled,
  control,
}: {
  name: string;
  max: number;
  disabled: boolean;
  control: ReturnType<typeof useShopQuantity>;
}) {
  if (max < 2) return null;
  return (
    <div className="mt-1.5 flex items-center gap-1.5">
      <DraftNumberInput
        key={control.inputKey}
        aria-label={`${name} 수량`}
        min={1}
        max={max}
        value={control.quantity}
        disabled={disabled}
        onValueChange={control.onType}
        className="min-h-10 w-16 rounded-lg border border-zinc-300 bg-white px-2 text-center text-sm tabular-nums disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-7 dark:border-zinc-700 dark:bg-zinc-900"
      />
      <Button
        type="button"
        size="xs"
        variant="secondary"
        disabled={disabled}
        onClick={() => control.onReplace(max)}
      >
        최대 {max}개
      </Button>
    </div>
  );
}
