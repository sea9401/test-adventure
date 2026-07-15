"use client";

import { useState } from "react";
import {
  SETTLEMENT_RESOURCE_KEYS,
  SETTLEMENT_RESOURCE_TO_MATERIAL,
  settlementBuildingMaterialsComplete,
  settlementDonationMaterialName,
  settlementResourceIcon,
  settlementResourceName,
  type AnySettlementBuildingUpgradeDef,
  type GuildFacilityDonationProgress,
  type SettlementBuildingId,
  type SettlementDonationMaterialId,
  type SettlementResources,
} from "@/adventure/data/v2/settlement";

export function GuildFacilityUpgradeFund({
  buildingId,
  next,
  progress,
  guildGold,
  guildFame,
  canComplete = false,
  completing = false,
  onComplete,
  onChanged,
}: {
  buildingId: SettlementBuildingId;
  next: AnySettlementBuildingUpgradeDef;
  progress?: GuildFacilityDonationProgress;
  guildGold: number;
  guildFame: number;
  canComplete?: boolean;
  completing?: boolean;
  onComplete?: () => void;
  onChanged?: () => void;
}) {
  const [donateOpen, setDonateOpen] = useState(false);
  const [inventory, setInventory] = useState<Record<string, number>>({});
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [donating, setDonating] = useState(false);
  const [notice, setNotice] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);

  const donated: SettlementResources =
    progress?.targetLevel === next.level ? progress.materials : {};
  const rows = SETTLEMENT_RESOURCE_KEYS.filter(
    (key) => (next.cost[key] ?? 0) > 0,
  ).map((key) => {
    const materialId = SETTLEMENT_RESOURCE_TO_MATERIAL[key];
    const required = Math.max(0, next.cost[key] ?? 0);
    const current = Math.min(required, Math.max(0, donated[key] ?? 0));
    return {
      key,
      materialId,
      required,
      current,
      remaining: Math.max(0, required - current),
    };
  });
  const materialsComplete = settlementBuildingMaterialsComplete(
    donated,
    next.cost,
  );
  const goldCost = Math.max(0, next.cost.gold ?? 0);
  const fameCost = Math.max(0, next.cost.fame ?? 0);
  const treasuryReady = guildGold >= goldCost;
  const fameReady = guildFame >= fameCost;
  const canSubmit = rows.some((row) => {
    const amount = Math.floor(Number(draft[row.materialId]) || 0);
    return (
      amount > 0 &&
      amount <= row.remaining &&
      amount <= (inventory[row.materialId] ?? 0)
    );
  }) && rows.every((row) => {
    const amount = Math.floor(Number(draft[row.materialId]) || 0);
    return (
      amount >= 0 &&
      amount <= row.remaining &&
      amount <= (inventory[row.materialId] ?? 0)
    );
  });

  async function openDonation() {
    setNotice(null);
    setDonateOpen(true);
    try {
      const res = await fetch("/api/v2/me/inventory");
      const json = (await res.json().catch(() => null)) as {
        materials?: Record<string, number>;
      } | null;
      if (res.ok) setInventory(json?.materials ?? {});
    } catch {
      setNotice({ kind: "err", text: "보유 재료를 불러오지 못했습니다." });
    }
  }

  async function donate() {
    if (donating || !canSubmit) return;
    const donations: Partial<Record<SettlementDonationMaterialId, number>> = {};
    for (const row of rows) {
      const amount = Math.floor(Number(draft[row.materialId]) || 0);
      if (amount > 0) donations[row.materialId] = amount;
    }
    setDonating(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/v2/guild/facilities/${buildingId}/donate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ donations }),
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        materials?: Record<string, number>;
      } | null;
      if (!res.ok || !json?.ok) {
        setNotice({ kind: "err", text: donationErrorText(json?.error) });
        return;
      }
      setInventory(json.materials ?? inventory);
      setDraft({});
      setDonateOpen(false);
      setNotice({ kind: "ok", text: "시설 업그레이드 재료를 기부했습니다." });
      onChanged?.();
    } catch {
      setNotice({ kind: "err", text: "재료 기부에 실패했습니다." });
    } finally {
      setDonating(false);
    }
  }

  return (
    <div className="mt-2 space-y-2 rounded-md border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-zinc-700 dark:text-zinc-200">
          Lv {next.level} 재료 기부
        </span>
        <span
          className={
            materialsComplete
              ? "text-emerald-600 dark:text-emerald-300"
              : "text-zinc-500 dark:text-zinc-400"
          }
        >
          {materialsComplete ? "재료 준비 완료" : "길드원 공동 진행"}
        </span>
      </div>

      <div className="space-y-1.5">
        {rows.map((row) => {
          const percent =
            row.required > 0
              ? Math.min(100, Math.floor((row.current / row.required) * 100))
              : 100;
          return (
            <div key={row.key} className="text-[11px]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-zinc-600 dark:text-zinc-300">
                  {settlementResourceIcon(row.key)} {settlementResourceName(row.key)}
                </span>
                <span className="tabular-nums text-zinc-500 dark:text-zinc-400">
                  {row.current.toLocaleString()} / {row.required.toLocaleString()}
                </span>
              </div>
              <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-[width]"
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
        완료 시 길드 금고 {goldCost.toLocaleString()}G
        {fameCost > 0 ? ` · 길드 명성 ${fameCost.toLocaleString()}` : ""}
      </div>

      {notice && (
        <p
          className={`text-[11px] ${
            notice.kind === "ok"
              ? "text-emerald-600 dark:text-emerald-300"
              : "text-red-600 dark:text-red-300"
          }`}
        >
          {notice.text}
        </p>
      )}

      {!materialsComplete && !donateOpen && (
        <button
          type="button"
          onClick={() => void openDonation()}
          className="mx-auto block w-[70%] rounded-md border border-amber-600 bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-600"
        >
          재료 기부
        </button>
      )}

      {!materialsComplete && donateOpen && (
        <div className="space-y-2 rounded border border-zinc-200 p-2 dark:border-zinc-700">
          {rows
            .filter((row) => row.remaining > 0)
            .map((row) => {
              const owned = inventory[row.materialId] ?? 0;
              const max = Math.min(owned, row.remaining);
              return (
                <label
                  key={row.materialId}
                  className="flex flex-wrap items-center gap-2 text-[11px]"
                >
                  <span className="w-24 shrink-0">
                    {settlementDonationMaterialName(row.materialId)}
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={max}
                    value={draft[row.materialId] ?? ""}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        [row.materialId]: event.target.value,
                      }))
                    }
                    className="w-20 rounded border border-zinc-300 bg-white px-1.5 py-0.5 tabular-nums dark:border-zinc-600 dark:bg-zinc-800"
                  />
                  <span className="text-zinc-400">
                    보유 {owned.toLocaleString()} · 남음 {row.remaining.toLocaleString()}
                  </span>
                </label>
              );
            })}
          <div className="flex justify-center gap-2">
            <button
              type="button"
              onClick={() => void donate()}
              disabled={donating || !canSubmit}
              className="rounded bg-amber-500 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {donating ? "기부 중" : "기부하기"}
            </button>
            <button
              type="button"
              onClick={() => {
                setDonateOpen(false);
                setDraft({});
              }}
              disabled={donating}
              className="rounded px-2 py-1 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            >
              닫기
            </button>
          </div>
          <p className="text-center text-[10px] text-zinc-400">
            기부한 재료는 되돌릴 수 없습니다.
          </p>
        </div>
      )}

      {canComplete && materialsComplete && (
        <div className="space-y-1 text-center">
          <button
            type="button"
            onClick={onComplete}
            disabled={completing || !treasuryReady || !fameReady}
            className="mx-auto block w-[70%] rounded-md border border-emerald-700 bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {completing ? "완료 처리 중" : "업그레이드 완료"}
          </button>
          {!treasuryReady && (
            <p className="text-[11px] text-red-500">길드 금고 골드가 부족합니다.</p>
          )}
          {treasuryReady && !fameReady && (
            <p className="text-[11px] text-red-500">사용 가능한 길드 명성이 부족합니다.</p>
          )}
        </div>
      )}
    </div>
  );
}

function donationErrorText(error?: string): string {
  switch (error) {
    case "no_guild":
      return "소속 길드가 없습니다.";
    case "building_required":
      return "먼저 해당 시설을 개방해야 합니다.";
    case "max_level":
      return "이미 최고 레벨입니다.";
    case "material_not_required":
      return "현재 단계에 필요하지 않은 재료입니다.";
    case "exceeds_required":
      return "남은 요구량보다 많이 기부할 수 없습니다.";
    case "insufficient_material":
      return "보유 재료가 부족합니다.";
    case "bad_request":
      return "기부 수량을 다시 확인해 주세요.";
    default:
      return "재료 기부에 실패했습니다.";
  }
}
