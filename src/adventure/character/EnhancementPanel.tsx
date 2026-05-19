"use client";

// 별빛 강화소 — 별빛 무구 인스턴스를 +1~+7 까지 누진 비용으로 강화 시도.
// 모드 선택 (safe/boost/high/risky/extreme) — 확률·보상 트레이드오프. 비용은 모드 무관.
// 실패 시 자루별 가능 횟수 -1. 0 이 되면 더 시도 불가.
//
// 강화 자체는 서버 권위(/api/enhance) — useEnhanceAction.handleEnhance 호출.

import { useMemo, useState } from "react";
import { Sparkle } from "@phosphor-icons/react";
import { ITEMS } from "@/adventure/data/items";
import { craftTierSuffix } from "@/adventure/data/craftQuality";
import {
  ENHANCE_MAX_LEVEL,
  ENHANCE_MODES,
  ENHANCE_MODE_SPEC,
  ENHANCE_SHARD_COST,
  modeBonus,
  resolveEnhancedItem,
  type EnhanceMode,
} from "@/adventure/character/enhancement";
import {
  ENCHANT_AFFIXES,
  enchantSlotCapacity,
} from "@/adventure/character/enchant";
import { EnchantDialog } from "@/adventure/character/EnchantDialog";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import type { EquipmentInstance } from "@/adventure/inventory/equipmentInstances";

type Props = {
  instances: readonly EquipmentInstance[];
  shardCount: number;
  /** materialId(enchant_*) → 보유 개수. 부여서 카탈로그 표시·검증에 사용. */
  enchantScrolls: Record<string, number>;
  onEnhance: (instanceId: string, mode: EnhanceMode) => void;
  onEnchant: (instanceId: string, materialId: string) => void;
};

const MODE_LABEL: Record<EnhanceMode, string> = {
  safe: "안전 100%",
  boost: "도전 70%",
  high: "위험 50%",
  risky: "고위험 30%",
  extreme: "극한 10%",
};

// 모드 1회 시 자루에 더해지는 보너스 미리보기.
function modeDeltaSummary(
  itemId: EquipmentInstance["itemId"],
  mode: EnhanceMode,
): string {
  const per = modeBonus(itemId, mode);
  const parts: string[] = [];
  if (per.atk) parts.push(`공격력 +${per.atk}`);
  if (per.def) parts.push(`방어력 +${per.def}`);
  if (per.str) parts.push(`힘 +${per.str}`);
  if (per.vit) parts.push(`활력 +${per.vit}`);
  if (per.dex) parts.push(`민첩 +${per.dex}`);
  if (per.luk) parts.push(`행운 +${per.luk}`);
  if (per.spd) parts.push(`속도 +${per.spd}`);
  return parts.join(" · ");
}

export function EnhancementPanel({
  instances,
  shardCount,
  enchantScrolls,
  onEnhance,
  onEnchant,
}: Props) {
  const [mode, setMode] = useState<EnhanceMode>("safe");
  const [enchantTarget, setEnchantTarget] = useState<EquipmentInstance | null>(
    null,
  );
  const hasAnyScroll = useMemo(
    () => Object.values(enchantScrolls).some((n) => n > 0),
    [enchantScrolls],
  );
  if (instances.length === 0) {
    return (
      <EmptyState
        icon={<Sparkle size={40} weight="duotone" />}
        title="강화할 장비가 없습니다"
        message="별빛 무구를 먼저 만들어 가져오세요."
      />
    );
  }
  const spec = ENHANCE_MODE_SPEC[mode];
  return (
    <div className="space-y-3">
      <Card as="section" padding="md">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            별빛 강화
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            보유 별빛 조각{" "}
            <span className="font-semibold text-amber-600 dark:text-amber-400">
              {shardCount}
            </span>
          </p>
        </div>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          별빛을 한 점 한 점 무구에 옮기는 자리. 단계마다 별빛 조각이 누진. 최대 +{ENHANCE_MAX_LEVEL}.
          모드를 낮은 확률로 고르면 한 번에 더 많은 결이 옮겨지지만, 실패하면 이 자루의 남은 시도 횟수가 한 번 깎인다.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="text-xs text-zinc-500 dark:text-zinc-400">강화 모드</label>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as EnhanceMode)}
            className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            {ENHANCE_MODES.map((m) => (
              <option key={m} value={m}>
                {MODE_LABEL[m]}
              </option>
            ))}
          </select>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            성공률 {spec.successPct}%
          </span>
        </div>
      </Card>

      <ul className="space-y-2">
        {instances.map((inst) => {
          const base = ITEMS[inst.itemId];
          const item = resolveEnhancedItem(
            inst.itemId,
            inst.craftTier,
            inst.enhanceHistory ?? inst.enhancementLevel,
            inst.instanceId,
            inst.enchantSlots,
          );
          const isMax = inst.enhancementLevel >= ENHANCE_MAX_LEVEL;
          const noAttempts = inst.remainingAttempts <= 0;
          const nextLevel = inst.enhancementLevel + 1;
          const nextCost = isMax ? 0 : ENHANCE_SHARD_COST[nextLevel] ?? 0;
          const canAfford = shardCount >= nextCost;
          const tierSuf = craftTierSuffix(inst.craftTier).trim();
          const enhSuf =
            inst.enhancementLevel > 0 ? `+${inst.enhancementLevel}` : "";
          const deltaSummary = isMax ? "" : modeDeltaSummary(inst.itemId, mode);
          const slotCap = enchantSlotCapacity(inst.enhancementLevel);
          const curSlots = inst.enchantSlots ?? [];
          const enchantOpen = slotCap > 0 && curSlots.length < slotCap;
          const enchantBtnDisabled = !enchantOpen || !hasAnyScroll;
          return (
            <li
              key={inst.instanceId}
              className="rounded-md border border-zinc-200 bg-white/90 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950/90"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex flex-wrap items-baseline gap-x-1.5">
                    <span className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
                      {base.name}
                    </span>
                    {tierSuf && (
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        {tierSuf}
                      </span>
                    )}
                    {enhSuf && (
                      <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                        {enhSuf}
                      </span>
                    )}
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      가능 횟수 {inst.remainingAttempts}
                    </span>
                  </div>
                  <div className="text-xs text-amber-600 dark:text-amber-400">
                    {item.stats.map((s) => `${s.label} ${s.value}`).join(" · ")}
                  </div>
                  {curSlots.length > 0 && (
                    <div className="flex flex-wrap gap-1 text-[11px] text-violet-700 dark:text-violet-300">
                      {curSlots.map((s, i) => {
                        const a = ENCHANT_AFFIXES[s.affixId];
                        const unit = a.unit === "percent" ? "%" : "";
                        return (
                          <span
                            key={i}
                            className="rounded-full border border-violet-300 bg-violet-50 px-2 py-0.5 dark:border-violet-800 dark:bg-violet-950"
                          >
                            {a.name} {s.value}
                            {unit}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {!isMax && !noAttempts && (
                    <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      성공 시: {deltaSummary} (별빛 조각 {nextCost})
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 pt-0.5">
                  {isMax ? (
                    <span className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300">
                      풀강 +{ENHANCE_MAX_LEVEL}
                    </span>
                  ) : noAttempts ? (
                    <span className="rounded-md border border-zinc-300 bg-zinc-50 px-2.5 py-1 text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
                      가능 횟수 소진
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onEnhance(inst.instanceId, mode)}
                      disabled={!canAfford}
                      className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300 dark:hover:bg-amber-900"
                    >
                      +{nextLevel} 시도 ({nextCost})
                    </button>
                  )}
                  {slotCap > 0 && (
                    <button
                      type="button"
                      onClick={() => setEnchantTarget(inst)}
                      disabled={enchantBtnDisabled}
                      className="rounded-md border border-violet-300 bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700 transition-colors hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-300 dark:hover:bg-violet-900"
                    >
                      마법부여 ({curSlots.length}/{slotCap})
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {enchantTarget && (
        <EnchantDialog
          instance={enchantTarget}
          scrolls={enchantScrolls}
          onPick={(materialId) => onEnchant(enchantTarget.instanceId, materialId)}
          onClose={() => setEnchantTarget(null)}
        />
      )}
    </div>
  );
}
