"use client";

import { useCallback, useEffect, useRef } from "react";
import { Button, buttonClassName } from "@/components/ui/Button";
import { SURFACE_ACCENT, SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useModalA11y } from "@/lib/useModalA11y";
import { enchantmentTransferCost } from "@/adventure/data/v2/equipmentEnchantmentTransfer";
import { enchantmentStage, formatLiberationOptionRoll, type LiberationCandidateRow } from "./equipmentLiberationViewModel";

export function TransferEquipmentSummary({ candidate, label }: { candidate: LiberationCandidateRow; label: string }) {
  const current = candidate.item.liberation;
  const level = candidate.item.enhance?.level ?? 0;
  return (
    <div className={`${SURFACE_INSET} min-w-0 p-3 text-sm`}>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}{candidate.isEquipped ? " · 장착 중" : ""}</p>
      <p className="mt-1 break-words font-bold">{candidate.name}{level > 0 ? ` +${level}` : ""}</p>
      {current ? <>
        <p className="mt-1 text-xs text-violet-700 dark:text-violet-300">마법부여 {enchantmentStage(current.rank)}단계 · {current.lineCount}줄</p>
        <ul className="mt-2 space-y-1" aria-label={`${label} 마법부여 옵션`}>
          {current.options.map((option) => <li key={option.id} className="flex flex-wrap justify-between gap-x-2 text-xs">
            <span>{formatLiberationOptionRoll(option)}</span><span className="tabular-nums">Lv.{option.level}</span>
          </li>)}
        </ul>
      </> : <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">마법부여 없음</p>}
    </div>
  );
}

export function EnchantmentTransferConfirmDialog({ source, target, busy, onConfirm, onClose }: {
  source: LiberationCandidateRow;
  target: LiberationCandidateRow;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const closeIfIdle = useCallback(() => { if (!busy) onClose(); }, [busy, onClose]);
  useEscapeKey(closeIfIdle);
  useModalA11y(panelRef);
  useEffect(() => { cancelRef.current?.focus(); }, []);
  if (!source.item.liberation) return null;
  const cost = enchantmentTransferCost(source.item.liberation);
  return (
    <div className="ui-modal-reveal fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm" role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) closeIfIdle(); }}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="enchantment-transfer-confirm-title" aria-describedby="enchantment-transfer-warning"
        className={`${SURFACE_CARD} ui-modal-panel max-h-[90dvh] w-full max-w-xl overflow-y-auto p-4 shadow-2xl sm:p-5`}>
        <h2 id="enchantment-transfer-confirm-title" className="text-lg font-bold">마법부여 이전 확인</h2>
        <div className="mt-4 space-y-2">
          <TransferEquipmentSummary candidate={source} label="원본 장비" />
          <p className="text-center text-sm font-semibold text-violet-700 dark:text-violet-300">↓ 마법부여 전체 이전 · 성공률 100%</p>
          <TransferEquipmentSummary candidate={target} label="받을 장비" />
        </div>
        <div id="enchantment-transfer-warning" className={`${SURFACE_ACCENT} mt-4 space-y-2 p-3 text-sm leading-relaxed`}>
          <p>원본 장비와 귀속은 유지되며, 원본의 마법부여만 제거됩니다.</p>
          <p>받는 장비는 즉시 귀속되어 거래할 수 없습니다.</p>
          {target.item.liberation ? <p className="font-bold text-rose-800 dark:text-rose-200">받는 장비의 기존 마법부여는 영구 소멸하며 되돌릴 수 없습니다.</p> : null}
        </div>
        <div className={`${SURFACE_INSET} mt-4 space-y-1 p-3 text-sm tabular-nums`}>
          <p>기본 비용: {cost.baseGoldCost.toLocaleString()} G</p>
          <p>줄 수 추가 비용: {cost.additionalGoldCost.toLocaleString()} G</p>
          <p className="font-bold">총 소모 골드: {cost.goldCost.toLocaleString()} G</p>
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button ref={cancelRef} type="button" className={buttonClassName({ size: "md" })} disabled={busy} onClick={closeIfIdle}>취소</button>
          <Button size="md" variant="primary" className="flex-1" disabled={busy} onClick={onConfirm}>
            {busy ? "이전 중…" : `${cost.goldCost.toLocaleString()} G 지불하고 이전`}
          </Button>
        </div>
      </div>
    </div>
  );
}
