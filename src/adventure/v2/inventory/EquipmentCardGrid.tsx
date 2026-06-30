"use client";

import {
  CheckCircle,
  Circle,
  Diamond,
  HandFist,
  Lock,
  Shield,
  Sneaker,
  Sword,
  type Icon,
} from "@phosphor-icons/react";
import { EmptyState } from "@/components/ui/EmptyState";
import { ItemTypeChip } from "@/components/ui/ItemTypeChip";
import { SURFACE_CARD } from "@/components/ui/surfaces";
import {
  V2_EQUIPMENT,
  effectiveStats,
  v2EquipPowerLabel,
  v2EquipStatRows,
  type V2Equipment,
  type V2EquipInstance,
  type V2EquipRoll,
  type V2EquipSlot,
} from "@/adventure/data/v2/v2Equipment";
import { rollQualityPct } from "@/adventure/data/v2/v2EquipVariance";
import {
  enhancedPower,
  type V2EnhanceState,
} from "@/adventure/data/v2/v2Enhance";
import { V2_ELEMENT_LABEL } from "@/adventure/data/v2/elements";
import {
  anchorOf,
  CraftOnlyBadge,
  powerNameClass,
  rollPctClass,
  type ItemCardAnchor,
} from "../V2ItemCard";

// 슬롯별 아이콘/색 — 카드 좌상단 표식.
const SLOT_ICON: Record<V2EquipSlot, { Icon: Icon; color: string }> = {
  weapon: { Icon: Sword, color: "text-rose-500" },
  armor: { Icon: Shield, color: "text-sky-500" },
  gloves: { Icon: HandFist, color: "text-amber-500" },
  boots: { Icon: Sneaker, color: "text-emerald-500" },
  ring: { Icon: Circle, color: "text-violet-500" },
  necklace: { Icon: Diamond, color: "text-pink-500" },
};

// 카드 스탯줄 — 개체 굴림 반영 기본 전투 스탯 + (무기만)속성 + 슬롯 고유 옵션(치명/회피/MP/HP/속도/
//   치명피해). 티어 숫자 표기는 제거(이름·전투 스탯·옵션으로 구분) — 옵션이 슬롯 정체성이라 노출.
function cardStatLine(
  item: V2Equipment,
  roll?: V2EquipRoll,
  enhance?: V2EnhanceState,
): string {
  const eff = effectiveStats(item, roll);
  const powerLabel = v2EquipPowerLabel(item);
  const parts = [`${powerLabel} ${enhancedPower(eff.power, enhance)}`];
  if (item.slot === "weapon" && item.element && item.element !== "neutral") {
    parts.push(V2_ELEMENT_LABEL[item.element]);
  }
  for (const row of v2EquipStatRows(item, roll)) {
    if (row.label === powerLabel || row.label === "무게") continue;
    parts.push(`${row.label} ${row.value}`);
  }
  return parts.join(" · ");
}

export type EquipmentCard = {
  inst: V2EquipInstance;
  isEquipped: boolean;
};

// 보유 장비 2열 카드 그리드 — 개체(instance) 단위. 슬롯 아이콘 + 장착 배지(✓/잠금) +
// 등급색 이름 + 굴림 반영 스탯줄. 카드 탭 → 옵션/장착 팝오버(V2ItemCard).
export function EquipmentCardGrid({
  cards,
  onOpenCard,
  selectedIid,
}: {
  cards: EquipmentCard[];
  onOpenCard: (inst: V2EquipInstance, anchor: ItemCardAnchor) => void;
  // 선택 모드(강화/재련): selectedIid 를 넘기면 에메랄드 하이라이트는 "선택한 장비"를 뜻하고,
  // 착용 장비는 우상단 "착용중" 배지로만 표시한다. 미전달 시(인벤토리)는 착용 장비를
  // 에메랄드 하이라이트 + 체크로 강조하는 기존 동작을 유지한다.
  selectedIid?: string | null;
}) {
  const selectable = selectedIid !== undefined;
  if (cards.length === 0) {
    return (
      <EmptyState
        icon={<Diamond size={40} weight="duotone" />}
        title="보유한 장비가 없습니다"
        message="상점에서 구매하거나 사냥터 드랍으로 모입니다."
      />
    );
  }
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {cards.map(({ inst, isEquipped }) => {
        const item = V2_EQUIPMENT[inst.id];
        const { Icon, color } = SLOT_ICON[item.slot];
        const pct = rollQualityPct(item, inst.roll);
        const isSelected = selectable && inst.iid === selectedIid;
        const highlighted = selectable ? isSelected : isEquipped;
        return (
          <button
            key={inst.iid}
            type="button"
            onClick={(e) => onOpenCard(inst, anchorOf(e.currentTarget))}
            aria-label={`${item.name} 정보`}
            className={`ui-equipment-card ui-item-rarity-t${item.tier} ui-lift-card relative flex min-h-[7.5rem] flex-col gap-1 p-3 text-left transition ${
              highlighted
                ? "is-active border-emerald-400 bg-emerald-50 dark:border-emerald-500 dark:bg-emerald-900"
                : `${SURFACE_CARD} hover:bg-zinc-50 dark:hover:bg-zinc-800`
            }`}
          >
            <div className="flex items-start justify-between gap-1">
              <span className="flex items-center gap-1">
                <Icon size={20} weight="duotone" className={color} />
                {inst.locked && (
                  <Lock
                    size={13}
                    weight="fill"
                    className="text-amber-500"
                    aria-label="잠금됨"
                  />
                )}
              </span>
              <span className="flex shrink-0 items-center gap-1">
                {pct != null && (
                  <span
                    className={`text-[11px] font-semibold tabular-nums ${rollPctClass(pct)}`}
                    title="품질"
                  >
                    {pct}%
                  </span>
                )}
                {isEquipped && selectable ? (
                  <span className="rounded bg-zinc-200 px-1.5 py-px text-[10px] font-medium text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
                    착용중
                  </span>
                ) : isEquipped ? (
                  <CheckCircle
                    size={18}
                    weight="fill"
                    className="text-emerald-500"
                    aria-label="장착됨"
                  />
                ) : null}
              </span>
            </div>
            <div className="flex min-w-0 items-center gap-1.5">
              <span
                className={`min-w-0 truncate text-sm font-semibold leading-tight ${powerNameClass(item, inst.roll)}`}
              >
                {item.name}
                {inst.enhance && inst.enhance.level > 0 ? (
                  <span className="ml-1 text-amber-500">
                    +{inst.enhance.level}
                  </span>
                ) : null}
              </span>
              <ItemTypeChip item={item} />
              {item.craftOnly ? <CraftOnlyBadge /> : null}
            </div>
            <div className="line-clamp-2 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
              {cardStatLine(item, inst.roll, inst.enhance)}
            </div>
          </button>
        );
      })}
    </div>
  );
}
