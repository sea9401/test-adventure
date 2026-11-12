"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { DraftNumberInput } from "@/components/ui/DraftNumberInput";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useModalA11y } from "@/lib/useModalA11y";

// 생활 공방의 수량 입력(빠른 수량·직접 입력·최대 수량 확인). LifeWorkshopView 와 전투 준비물 패널이 함께 쓴다.

export function LifeWorkshopMaxConfirmDialog({
  quantity,
  unit,
  actionLabel,
  onConfirm,
  onClose,
}: {
  quantity: number;
  unit: "개" | "회";
  actionLabel: "제작" | "가공";
  onConfirm: () => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useEscapeKey(onClose);
  useModalA11y(panelRef);

  return (
    <div
      className="ui-modal-reveal fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="life-workshop-max-confirm-title"
        aria-describedby="life-workshop-max-confirm-description"
        className={`${SURFACE_CARD} ui-modal-panel w-full max-w-sm p-5 shadow-2xl`}
      >
        <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
          최대 수량 {actionLabel}
        </p>
        <h2
          id="life-workshop-max-confirm-title"
          className="mt-1 text-lg font-bold"
        >
          최대 {quantity.toLocaleString()}{unit}를 {actionLabel}할까요?
        </h2>
        <p
          id="life-workshop-max-confirm-description"
          className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300"
        >
          현재 보유 재료로 가능한 최대 수량을 한 번에 사용합니다. 실행 전에
          수량을 다시 확인해 주세요.
        </p>
        <div className={`${SURFACE_INSET} mt-4 flex items-center justify-between gap-3 p-3 text-sm`}>
          <span className="text-zinc-500 dark:text-zinc-400">실행 수량</span>
          <strong className="tabular-nums text-amber-700 dark:text-amber-300">
            {quantity.toLocaleString()}{unit}
          </strong>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button size="md" onClick={onClose}>
            취소
          </Button>
          <Button size="md" variant="warning" onClick={onConfirm}>
            최대 {quantity.toLocaleString()}{unit} {actionLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function LifeWorkshopQuantityControls({
  maxQuantity,
  unit,
  actionLabel,
  inputLabel,
  busy,
  onSubmit,
}: {
  maxQuantity: number;
  unit: "개" | "회";
  actionLabel: "제작" | "가공";
  inputLabel: string;
  busy: boolean;
  onSubmit: (quantity: number) => void;
}) {
  const [quantity, setQuantity] = useState(1);
  const [maxConfirmOpen, setMaxConfirmOpen] = useState(false);
  const max = Math.max(0, Math.floor(maxQuantity));
  const selectedQuantity = max > 0 ? Math.min(max, quantity) : 1;
  const disabled = busy || max < 1;

  return (
    <div className="shrink-0 space-y-1.5">
      <div className="flex flex-wrap gap-1" aria-label={`${actionLabel} 빠른 수량`}>
        <Button
          size="xs"
          variant="secondary"
          disabled={disabled}
          onClick={() => onSubmit(1)}
        >
          1{unit}
        </Button>
        <Button
          size="xs"
          variant="secondary"
          disabled={busy || max < 10}
          onClick={() => onSubmit(10)}
        >
          10{unit}
        </Button>
        <Button
          size="xs"
          variant="secondary"
          disabled={disabled}
          aria-haspopup={max > 1 ? "dialog" : undefined}
          onClick={() => {
            if (max > 1) setMaxConfirmOpen(true);
            else onSubmit(max);
          }}
        >
          최대 {max.toLocaleString()}{unit}
        </Button>
      </div>
      <div className="flex items-center gap-1">
        <DraftNumberInput
          min={1}
          max={Math.max(1, max)}
          value={selectedQuantity}
          onValueChange={setQuantity}
          disabled={disabled}
          aria-label={inputLabel}
          className="h-8 w-20 rounded-md border border-zinc-300 bg-white px-2 text-center text-xs tabular-nums disabled:cursor-not-allowed disabled:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-950"
        />
        <Button
          size="xs"
          variant="warning"
          disabled={disabled}
          onClick={() => onSubmit(selectedQuantity)}
        >
          {selectedQuantity.toLocaleString()}{unit} {actionLabel}
        </Button>
      </div>
      {maxConfirmOpen ? (
        <LifeWorkshopMaxConfirmDialog
          quantity={max}
          unit={unit}
          actionLabel={actionLabel}
          onClose={() => setMaxConfirmOpen(false)}
          onConfirm={() => {
            setMaxConfirmOpen(false);
            onSubmit(max);
          }}
        />
      ) : null}
    </div>
  );
}
