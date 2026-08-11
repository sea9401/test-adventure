"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/Button";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useModalA11y } from "@/lib/useModalA11y";
import type { FishSpecimenSpProjection } from "@/lib/server/fishSpecimenSp";

export type FishSpecimenExtractProjection = FishSpecimenSpProjection;

export function FishSpecimenExtractModal({
  fish,
  projection,
  busy,
  onConfirm,
  onClose,
}: {
  fish: { name: string };
  projection: FishSpecimenExtractProjection;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useEscapeKey(onClose);
  useModalA11y(panelRef);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="fish-specimen-extract-title"
        className={`${SURFACE_CARD} w-full max-w-md p-4`}
      >
        <h2 id="fish-specimen-extract-title" className="text-base font-bold">
          {fish.name} 표본 추출
        </h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          도감 등록 권리를 거래 가능한 표본 1개로 바꿉니다. 최대어·누적 마릿수·최초 포획 등
          개인 어획 기록은 유지됩니다.
        </p>

        {projection.spLoss > 0 && (
          <div className={`${SURFACE_INSET} mt-3 space-y-1 px-3 py-2 text-sm`}>
            <div>도감 SP +{projection.fishSpBefore} → +{projection.fishSpAfter}</div>
            <div>전체 SP {projection.totalSpBefore} → {projection.totalSpAfter}</div>
          </div>
        )}

        {projection.overBudget && (
          <div className={`${SURFACE_INSET} mt-3 border-rose-300 px-3 py-2 text-sm text-rose-700 dark:border-rose-800 dark:text-rose-300`}>
            <div className="font-semibold">현재 장착 스킬을 먼저 조정해 주세요.</div>
            <div className="mt-1">
              장착 스킬 {projection.equippedSpUsed} / 새 한도 {projection.totalSpAfter}
            </div>
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <Button size="sm" onClick={onClose} disabled={busy}>
            취소
          </Button>
          {!projection.overBudget && (
            <Button size="sm" variant="danger" onClick={onConfirm} disabled={busy}>
              {busy ? "추출 중…" : "표본 추출 확정"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
