"use client";

import { useState, type ReactNode } from "react";
import { fetchGameState } from "../fetchGameState";
import {
  SETTLEMENT_RESOURCE_KEYS,
  SETTLEMENT_RESOURCE_TO_MATERIAL,
  settlementDonationMaterialName,
  settlementResourceIconName,
  settlementResourceName,
  type SettlementDonationMaterialId,
  type SettlementResources,
} from "@/adventure/data/v2/settlement";
import type { AdventurerAssociationFacilityId } from "@/adventure/data/v2/adventurerAssociation";
import { SURFACE_INSET } from "@/components/ui/surfaces";
import { PlumpGameIcon } from "@/components/icons/PlumpGameIcon";

type Upgrade = {
  level: number;
  associationCost: SettlementResources & { gold?: number };
};

export function AssociationFacilityFund({
  buildingId,
  progress,
  next,
  onChanged,
}: {
  buildingId: AdventurerAssociationFacilityId;
  progress: { materials: SettlementResources; gold: number };
  next: Upgrade;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [inventory, setInventory] = useState<Record<string, number>>({});
  const [goldOwned, setGoldOwned] = useState(0);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [goldDraft, setGoldDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const rows = SETTLEMENT_RESOURCE_KEYS.filter(
    (key) => (next.associationCost[key] ?? 0) > 0,
  ).map((key) => {
    const materialId = SETTLEMENT_RESOURCE_TO_MATERIAL[key];
    const required = Math.max(0, next.associationCost[key] ?? 0);
    const current = Math.min(required, Math.max(0, progress.materials[key] ?? 0));
    return { key, materialId, required, current, remaining: required - current };
  });
  const requiredGold = Math.max(0, next.associationCost.gold ?? 0);
  const currentGold = Math.min(requiredGold, Math.max(0, progress.gold));
  const remainingGold = Math.max(0, requiredGold - currentGold);
  const canSubmit =
    Math.floor(Number(goldDraft) || 0) > 0 ||
    rows.some((row) => Math.floor(Number(draft[row.materialId]) || 0) > 0);

  function setAmount(id: string, amount: number, max: number) {
    setDraft((value) => ({
      ...value,
      [id]: String(Math.max(0, Math.min(Math.floor(amount), Math.floor(max)))),
    }));
  }

  async function openDonation() {
    setOpen(true);
    setNotice(null);
    try {
      const [inventoryResponse, stateResponse] = await Promise.all([
        fetch("/api/v2/me/inventory"),
        fetchGameState(),
      ]);
      const inventoryJson = (await inventoryResponse.json().catch(() => null)) as {
        materials?: Record<string, number>;
      } | null;
      const stateJson = (await stateResponse.json().catch(() => null)) as {
        character?: { gold?: number; bankedGold?: number };
        gold?: number;
        bankedGold?: number;
      } | null;
      setInventory(inventoryJson?.materials ?? {});
      const character = stateJson?.character;
      setGoldOwned(
        Math.max(0, Math.floor(character?.gold ?? stateJson?.gold ?? 0)) +
          Math.max(0, Math.floor(character?.bankedGold ?? stateJson?.bankedGold ?? 0)),
      );
    } catch {
      setNotice("보유 재화를 불러오지 못했습니다.");
    }
  }

  async function donate() {
    if (busy || !canSubmit) return;
    const donations: Partial<Record<SettlementDonationMaterialId, number>> = {};
    for (const row of rows) {
      const amount = Math.floor(Number(draft[row.materialId]) || 0);
      if (amount > 0) donations[row.materialId] = amount;
    }
    const gold = Math.floor(Number(goldDraft) || 0);
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch(
        `/api/v2/association/facilities/${buildingId}/donate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ donations, gold }),
        },
      );
      const json = (await response.json().catch(() => null)) as {
        ok?: boolean;
        upgraded?: boolean;
        error?: string;
      } | null;
      if (!response.ok || !json?.ok) {
        setNotice(associationDonationError(json?.error));
        return;
      }
      setDraft({});
      setGoldDraft("");
      setOpen(false);
      setNotice(json.upgraded ? `협회 시설이 Lv.${next.level}로 자동 승급했습니다.` : "기부를 완료했습니다.");
      onChanged();
    } catch {
      setNotice("기부 요청에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`${SURFACE_INSET} space-y-2 px-3 py-2`}>
      <div className="flex items-center justify-between gap-2 text-xs">
        <strong>Lv.{next.level} 공동 기부</strong>
        <span className="text-zinc-500 dark:text-zinc-400">달성 즉시 자동 승급</span>
      </div>
      {rows.map((row) => (
        <ProgressRow
          key={row.key}
          icon={<PlumpGameIcon name={settlementResourceIconName(row.key)} size={15} />}
          label={settlementResourceName(row.key)}
          current={row.current}
          required={row.required}
        />
      ))}
      <ProgressRow label="골드" current={currentGold} required={requiredGold} suffix="G" />
      {notice && <p className="text-xs text-amber-700 dark:text-amber-300">{notice}</p>}
      {!open ? (
        <button
          type="button"
          onClick={() => void openDonation()}
          className="w-full rounded-md bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-700"
        >
          재료·골드 기부
        </button>
      ) : (
        <div className="space-y-2 border-t border-zinc-200 pt-2 dark:border-zinc-700">
          {rows.filter((row) => row.remaining > 0).map((row) => {
            const owned = Math.max(0, inventory[row.materialId] ?? 0);
            const max = Math.min(owned, row.remaining);
            return (
              <label key={row.key} className="block text-xs">
                <span className="flex justify-between gap-2">
                  <span>{settlementDonationMaterialName(row.materialId)}</span>
                  <span className="text-zinc-500">보유 {owned.toLocaleString()}</span>
                </span>
                <div className="mt-1 flex gap-1">
                  <input
                    type="number"
                    min={0}
                    max={max}
                    value={draft[row.materialId] ?? ""}
                    onChange={(event) => setAmount(row.materialId, Number(event.target.value), max)}
                    className="min-w-0 flex-1 rounded border border-zinc-300 bg-white px-2 py-1.5 dark:border-zinc-600 dark:bg-zinc-950"
                  />
                  <button type="button" onClick={() => setAmount(row.materialId, max, max)} className="rounded border border-zinc-300 px-2 dark:border-zinc-600">최대</button>
                </div>
              </label>
            );
          })}
          {remainingGold > 0 && (
            <label className="block text-xs">
              <span className="flex justify-between gap-2">
                <span>골드</span>
                <span className="text-zinc-500">사용 가능 {goldOwned.toLocaleString()}G</span>
              </span>
              <div className="mt-1 flex gap-1">
                <input
                  type="number"
                  min={0}
                  max={Math.min(goldOwned, remainingGold)}
                  value={goldDraft}
                  onChange={(event) => setGoldDraft(String(Math.max(0, Math.min(Math.floor(Number(event.target.value) || 0), Math.min(goldOwned, remainingGold)))))}
                  className="min-w-0 flex-1 rounded border border-zinc-300 bg-white px-2 py-1.5 dark:border-zinc-600 dark:bg-zinc-950"
                />
                <button type="button" onClick={() => setGoldDraft(String(Math.min(goldOwned, remainingGold)))} className="rounded border border-zinc-300 px-2 dark:border-zinc-600">최대</button>
              </div>
            </label>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={() => setOpen(false)} className="flex-1 rounded border border-zinc-300 px-3 py-2 text-xs dark:border-zinc-600">취소</button>
            <button type="button" disabled={busy || !canSubmit} onClick={() => void donate()} className="flex-1 rounded bg-amber-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{busy ? "기부 중" : "기부"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ProgressRow({ icon, label, current, required, suffix = "" }: { icon?: ReactNode; label: string; current: number; required: number; suffix?: string }) {
  const percent = required > 0 ? Math.min(100, Math.floor((current / required) * 100)) : 100;
  return (
    <div className="text-[11px]">
      <div className="flex justify-between gap-2"><span className="inline-flex items-center gap-1">{icon}{label}</span><span className="tabular-nums text-zinc-500">{current.toLocaleString()}{suffix} / {required.toLocaleString()}{suffix}</span></div>
      <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700"><div className="h-full bg-amber-500" style={{ width: `${percent}%` }} /></div>
    </div>
  );
}

function associationDonationError(error?: string): string {
  if (error === "insufficient_material") return "보유 재료가 부족합니다.";
  if (error === "insufficient_gold") return "사용 가능한 골드가 부족합니다.";
  if (error === "exceeds_required") return "남은 목표보다 많은 수량입니다.";
  if (error === "material_not_required") return "현재 단계에서 필요하지 않은 재료입니다.";
  if (error === "max_level") return "이미 최고 레벨입니다.";
  return "기부를 완료하지 못했습니다.";
}
