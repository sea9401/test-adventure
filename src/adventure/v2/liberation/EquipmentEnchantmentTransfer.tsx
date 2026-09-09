"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { StatusBanner } from "@/components/ui/StatusBanner";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import { enchantmentTransferCost, equipmentLiberationRevision } from "@/adventure/data/v2/equipmentEnchantmentTransfer";
import type { V2EquipInstance } from "@/adventure/data/v2/v2Equipment";
import type { EnchantmentTransferIntent, EnchantmentTransferResponse } from "@/lib/server/equipmentEnchantmentTransfer";
import type { LiberationCandidateRow } from "./equipmentLiberationViewModel";
import { EquipmentEnchantmentPickerDialog } from "./EquipmentEnchantmentPickerDialog";
import { EnchantmentTransferConfirmDialog, TransferEquipmentSummary } from "./EnchantmentTransferConfirmDialog";

type Snapshot = { source: LiberationCandidateRow; target: LiberationCandidateRow };
type Pending = EnchantmentTransferIntent & { requestId: string };
const ERRORS: Record<string, string> = {
  insufficient_gold: "골드가 부족합니다.",
  stale_state: "장비 상태가 바뀌었습니다. 최신 옵션을 확인하고 다시 진행해 주세요.",
  not_owned: "장비를 더 이상 보유하고 있지 않습니다. 장비 목록을 새로 불러와 주세요.",
  ineligible: "6T 이상이며 폭풍 개량하지 않은 장비끼리만 이전할 수 있습니다.",
  slot_mismatch: "같은 부위의 장비끼리만 이전할 수 있습니다.",
  same_item: "서로 다른 장비를 선택해 주세요.",
  no_enchantment: "원본 장비에 이전할 마법부여가 없습니다.",
};

export function EquipmentEnchantmentTransfer({ source, candidates, gold, bankedGold, onItemUpdated, onComplete, onClose }: {
  source: LiberationCandidateRow;
  candidates: readonly LiberationCandidateRow[];
  gold: number;
  bankedGold: number;
  onItemUpdated: (item: V2EquipInstance) => void;
  onComplete: (response: EnchantmentTransferResponse) => void;
  onClose: () => void;
}) {
  const [targetIid, setTargetIid] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const inFlight = useRef(false);
  const pending = useRef<Pending | null>(null);
  const targets = candidates.filter((row) => row.iid !== source.iid && row.slot === source.slot);
  const target = targets.find((row) => row.iid === targetIid);
  const cost = source.item.liberation ? enchantmentTransferCost(source.item.liberation) : null;
  const spendable = gold + bankedGold;

  async function submit() {
    if (!confirmation || inFlight.current) return;
    const intent: EnchantmentTransferIntent = {
      sourceIid: confirmation.source.iid,
      targetIid: confirmation.target.iid,
      expectedSourceRevision: equipmentLiberationRevision(confirmation.source.item),
      expectedTargetRevision: equipmentLiberationRevision(confirmation.target.item),
    };
    if (source.iid !== intent.sourceIid || target?.iid !== intent.targetIid ||
      equipmentLiberationRevision(source.item) !== intent.expectedSourceRevision ||
      equipmentLiberationRevision(target.item) !== intent.expectedTargetRevision) {
      setConfirmation(null);
      setMessage(ERRORS.stale_state);
      return;
    }
    const old = pending.current;
    const request = old && old.sourceIid === intent.sourceIid && old.targetIid === intent.targetIid &&
      old.expectedSourceRevision === intent.expectedSourceRevision && old.expectedTargetRevision === intent.expectedTargetRevision
      ? old : { ...intent, requestId: crypto.randomUUID() };
    pending.current = request;
    inFlight.current = true;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/v2/me/equipment/enchantment-transfer", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request),
      });
      // 5xx도 커밋 후 응답만 유실됐을 수 있으므로 같은 요청 ID를 보존한다.
      if (response.status >= 500) throw new Error("server_error");
      const body = await response.json() as Partial<EnchantmentTransferResponse> & { error?: string };
      if (!response.ok || !body.ok) {
        pending.current = null;
        if (body.error === "stale_state") {
          if (body.source) onItemUpdated(body.source);
          if (body.target) onItemUpdated(body.target);
        }
        setMessage(ERRORS[body.error ?? ""] ?? "이전하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }
      if (!body.source || !body.target || typeof body.gold !== "number" || typeof body.bankedGold !== "number" || typeof body.spentGold !== "number") {
        throw new Error("incomplete_response");
      }
      pending.current = null;
      onComplete(body as EnchantmentTransferResponse);
    } catch {
      setMessage("연결을 확인한 뒤 다시 시도해 주세요. 같은 요청으로 이어서 처리합니다.");
    } finally {
      inFlight.current = false;
      setBusy(false);
      setConfirmation(null);
    }
  }

  return <>
    <section className={`${SURFACE_CARD} p-4 sm:p-5`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">마법부여 이전</h2>
        <Button disabled={busy} onClick={onClose}>작업대로 돌아가기</Button>
      </div>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">같은 부위의 6T 이상 장비로 마법부여 전체를 옮깁니다. 폭풍 개량 장비는 제외됩니다.</p>
      <div className="mt-4 space-y-3">
        <TransferEquipmentSummary candidate={source} label="원본 장비" />
        <p className="text-center text-violet-700 dark:text-violet-300" aria-hidden>↓</p>
        {target ? <TransferEquipmentSummary candidate={target} label="받을 장비" /> : null}
        <Button fullWidth disabled={busy || targets.length === 0} onClick={() => setPickerOpen(true)}>받을 장비 선택</Button>
        {targets.length === 0 ? <p className="text-sm text-zinc-500 dark:text-zinc-400">같은 부위에 이전받을 수 있는 다른 장비가 없습니다.</p> : null}
      </div>
      {cost ? <div className={`${SURFACE_INSET} mt-4 space-y-1 p-3 text-sm tabular-nums`}>
        <p>기본 {cost.baseGoldCost.toLocaleString()} G + 줄 수 추가 {cost.additionalGoldCost.toLocaleString()} G</p>
        <p className="font-bold">총 이전 비용 {cost.goldCost.toLocaleString()} G</p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">결제 가능 {spendable.toLocaleString()} G · 소지 골드부터 사용하고 부족분은 은행에서 결제합니다.</p>
      </div> : null}
      {cost && spendable < cost.goldCost ? <div className="mt-3"><StatusBanner tone="warning">골드가 부족합니다.</StatusBanner></div> : null}
      {message ? <div className="mt-3"><StatusBanner tone="warning">{message}</StatusBanner></div> : null}
      <Button variant="primary" fullWidth className="mt-4" disabled={busy || !target || !cost || spendable < cost.goldCost}
        onClick={() => { if (target) { setMessage(null); setConfirmation({ source, target }); } }}>이전 내용 확인</Button>
    </section>
    {pickerOpen ? <EquipmentEnchantmentPickerDialog title="이전받을 장비 선택" candidates={targets} selectedIid={targetIid} busy={busy}
      onSelect={(iid) => { setTargetIid(iid); setPickerOpen(false); setMessage(null); }} onClose={() => setPickerOpen(false)} /> : null}
    {confirmation ? <EnchantmentTransferConfirmDialog {...confirmation} busy={busy} onConfirm={() => void submit()} onClose={() => setConfirmation(null)} /> : null}
  </>;
}
