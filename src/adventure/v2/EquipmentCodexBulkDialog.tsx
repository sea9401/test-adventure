"use client";

import {
  V2_EQUIPMENT,
  V2_EQUIP_SETS,
  V2_EQUIP_TAG_SETS,
  V2_SLOT_LABEL,
  craftQualityStars,
  type V2EquipInstance,
  type V2EquipSlot,
} from "@/adventure/data/v2/v2Equipment";
import { rollQualityPct } from "@/adventure/data/v2/v2EquipVariance";
import { SURFACE_INSET } from "@/components/ui/surfaces";
import { EquipmentTierBadge, itemNameClass } from "./V2ItemCard";
import type { EquipmentCodexBulkCandidate } from "./equipmentCodexBulk";

export type { EquipmentCodexBulkCandidate } from "./equipmentCodexBulk";

function setNamesFor(inst: V2EquipInstance): string[] {
  const item = V2_EQUIPMENT[inst.id];
  return [
    item.setId
      ? V2_EQUIP_SETS.find((set) => set.id === item.setId)?.name
      : undefined,
    ...(item.setTags ?? []).map(
      (tag) => V2_EQUIP_TAG_SETS.find((set) => set.id === tag)?.name,
    ),
  ].filter((name): name is string => Boolean(name));
}

function isRiskyCandidate(candidate: EquipmentCodexBulkCandidate): boolean {
  const { inst, ownedCount } = candidate;
  const item = V2_EQUIPMENT[inst.id];
  return Boolean(
    item.rarity === "unique" ||
      (inst.enhance?.level ?? 0) > 0 ||
      inst.craftQuality ||
      inst.craftedBy?.masterwork ||
      ownedCount <= 1,
  );
}

export function EquipmentCodexBulkDialog({
  slot,
  candidates,
  selectedIids,
  busy,
  onToggle,
  onSelectAll,
  onClearAll,
  onCancel,
  onConfirm,
}: {
  slot: V2EquipSlot;
  candidates: readonly EquipmentCodexBulkCandidate[];
  selectedIids: ReadonlySet<string>;
  busy: boolean;
  onToggle: (iid: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const selectedCount = candidates.filter(({ inst }) =>
    selectedIids.has(inst.iid),
  ).length;
  const riskyCount = candidates.filter(
    (candidate) =>
      selectedIids.has(candidate.inst.iid) && isRiskyCandidate(candidate),
  ).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="equipment-codex-bulk-title"
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border border-zinc-200 bg-white p-4 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="equipment-codex-bulk-title" className="text-base font-bold">
              {V2_SLOT_LABEL[slot]} 장비 일괄등록
            </h2>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              등록하면 아래 장비 개체가 영구적으로 소모됩니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="shrink-0 rounded px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800"
            aria-label="일괄등록 취소"
          >
            닫기
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-zinc-600 dark:text-zinc-300">
            미장착·미잠금 장비 중 강화와 품질이 낮은 개체부터 선택했습니다.
          </p>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={onSelectAll}
              disabled={busy || selectedCount === candidates.length}
              className="rounded border border-zinc-300 px-2 py-1 text-[11px] font-medium text-zinc-600 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300"
            >
              전체 선택
            </button>
            <button
              type="button"
              onClick={onClearAll}
              disabled={busy || selectedCount === 0}
              className="rounded border border-zinc-300 px-2 py-1 text-[11px] font-medium text-zinc-600 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300"
            >
              전체 해제
            </button>
          </div>
        </div>

        {riskyCount > 0 && (
          <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-zinc-950 dark:text-amber-200">
            주의 장비 {riskyCount}개가 선택되어 있습니다. 유니크·강화·제작
            품질·명장 제작품 또는 마지막 보유 장비인지 확인해 주세요.
          </div>
        )}

        <ul className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {candidates.map((candidate) => {
            const { inst, ownedCount } = candidate;
            const item = V2_EQUIPMENT[inst.id];
            const selected = selectedIids.has(inst.iid);
            const quality = rollQualityPct(item, inst.roll);
            const enhanceLevel = Math.max(0, inst.enhance?.level ?? 0);
            const craftStars = craftQualityStars(inst.craftQuality);
            const setNames = setNamesFor(inst);
            return (
              <li key={inst.iid}>
                <label
                  className={`${SURFACE_INSET} flex cursor-pointer items-start gap-3 p-3 ${
                    selected ? "ring-1 ring-emerald-400" : ""
                  } ${busy ? "cursor-not-allowed" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={busy}
                    onChange={() => onToggle(inst.iid)}
                    className="mt-1 size-4 shrink-0 accent-emerald-600"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <strong className={`text-sm ${itemNameClass(item)}`}>
                        {item.name}
                      </strong>
                      <EquipmentTierBadge tier={item.tier} compact />
                      {item.rarity === "unique" && (
                        <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-bold text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                          유니크
                        </span>
                      )}
                      {item.craftOnly && (
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                          제작 전용
                        </span>
                      )}
                      {inst.craftedBy?.masterwork && (
                        <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                          명장 제작품
                        </span>
                      )}
                    </span>
                    <span className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                      {enhanceLevel > 0 && (
                        <span className="font-medium text-sky-700 dark:text-sky-300">
                          강화 +{enhanceLevel}
                        </span>
                      )}
                      {quality != null && <span>품질 {quality}%</span>}
                      {craftStars && (
                        <span className="font-medium text-amber-700 dark:text-amber-300">
                          제작 품질 {craftStars}
                        </span>
                      )}
                      {setNames.length > 0 && (
                        <span>세트 · {setNames.join(", ")}</span>
                      )}
                      <span>보유 {ownedCount}개</span>
                      {ownedCount <= 1 && (
                        <span className="font-bold text-rose-700 dark:text-rose-300">
                          마지막 보유 장비
                        </span>
                      )}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>

        <div className="mt-4 flex justify-end gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-700">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || selectedCount === 0}
            className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-500 dark:bg-emerald-500 dark:text-emerald-950 dark:hover:bg-emerald-400 dark:disabled:bg-zinc-700 dark:disabled:text-zinc-400"
          >
            {busy
              ? "일괄 등록 중…"
              : `선택한 장비 ${selectedCount}종 등록`}
          </button>
        </div>
      </section>
    </div>
  );
}
