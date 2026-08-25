"use client";

import {
  CheckCircle,
  Diamond,
  HandFist,
  Lock,
  Shield,
  Sneaker,
  Sword,
  type Icon,
} from "@phosphor-icons/react";
import { NecklaceIcon, RingIcon } from "../EquipmentSlotIcons";
import { EmptyState } from "@/components/ui/EmptyState";
import { ItemTypeChip } from "@/components/ui/ItemTypeChip";
import {
  V2_EQUIPMENT,
  equipmentPowerDisplayValue,
  effectiveStats,
  powerWithBonuses,
  v2EquipPowerLabel,
  v2EquipStatRows,
  type V2Equipment,
  type V2EquipInstance,
  type V2EquipRoll,
  type V2EquipSlot,
  type V2CraftQualityState,
} from "@/adventure/data/v2/v2Equipment";
import { rollQualityPct } from "@/adventure/data/v2/v2EquipVariance";
import { type V2EnhanceState } from "@/adventure/data/v2/v2Enhance";
import { V2_ELEMENT_LABEL } from "@/adventure/data/v2/elements";
import { equipmentProgressionLock } from "@/adventure/data/v2/equipmentProgression";
import {
  anchorOf,
  CraftOnlyBadge,
  CraftQualityBadge,
  EquipmentTierBadge,
  EnhanceLevelBadge,
  MasterworkBadge,
  powerNameClass,
  QualityPctText,
  type ItemCardAnchor,
} from "../V2ItemCard";
import { EquipmentCodexBadge } from "../EquipmentCodexBadge";

// 슬롯별 아이콘/색 — 카드 좌상단 표식.
const SLOT_ICON: Record<V2EquipSlot, { Icon: Icon; color: string }> = {
  weapon: { Icon: Sword, color: "text-rose-500" },
  armor: { Icon: Shield, color: "text-sky-500" },
  gloves: { Icon: HandFist, color: "text-amber-500" },
  boots: { Icon: Sneaker, color: "text-emerald-500" },
  ring: { Icon: RingIcon, color: "text-violet-500" },
  necklace: { Icon: NecklaceIcon, color: "text-pink-500" },
};

// 카드 스탯줄 — 개체 굴림 반영 기본 전투 스탯 + (무기만)속성 + 슬롯 고유 옵션(치명/회피/MP/HP/속도/
//   치명피해). 티어 숫자 표기는 제거(이름·전투 스탯·옵션으로 구분) — 옵션이 슬롯 정체성이라 노출.
function cardStatLine(
  item: V2Equipment,
  roll?: V2EquipRoll,
  enhance?: V2EnhanceState,
  craftQuality?: V2CraftQualityState,
): string {
  const eff = effectiveStats(item, roll);
  const powerLabel = v2EquipPowerLabel(item);
  const parts = [
    `${powerLabel} ${equipmentPowerDisplayValue(
      powerWithBonuses(eff.power, enhance, craftQuality),
    )}`,
  ];
  if (item.slot === "weapon" && item.element && item.element !== "neutral") {
    parts.push(V2_ELEMENT_LABEL[item.element]);
  }
  for (const row of v2EquipStatRows(item, roll, enhance, craftQuality)) {
    if (row.label === powerLabel || row.label === "무게") continue;
    parts.push(`${row.label} ${row.value}`);
  }
  return parts.join(" · ");
}

export type EquipmentCard = {
  inst: V2EquipInstance;
  isEquipped: boolean;
};

export type EquipmentSaleCardSelection = {
  active: boolean;
  selectedIids: ReadonlySet<string>;
  onToggle: (inst: V2EquipInstance) => void;
};

// 보유 장비 2열 카드 그리드 — 개체(instance) 단위. 슬롯 아이콘 + 장착 배지(✓/잠금) +
// 표시 위력색 이름 + 굴림 반영 스탯줄. 카드 탭 → 옵션/장착 팝오버(V2ItemCard).
export function EquipmentCardGrid({
  cards,
  onOpenCard,
  onRegisterCodex,
  codexBusyIid,
  selectedIid,
  saleSelection,
  recentlyAcquiredIid,
  frontierDepth,
}: {
  cards: EquipmentCard[];
  onOpenCard: (inst: V2EquipInstance, anchor: ItemCardAnchor) => void;
  // 인벤토리에서만 전달. 미등록 배지를 누르면 해당 개체의 도감 등록을 시작한다.
  onRegisterCodex?: (inst: V2EquipInstance) => void;
  codexBusyIid?: string | null;
  // 선택 모드(강화/재련): selectedIid 를 넘기면 에메랄드 하이라이트는 "선택한 장비"를 뜻하고,
  // 착용 장비는 우상단 "착용중" 배지로만 표시한다. 미전달 시(인벤토리)는 착용 장비를
  // 에메랄드 하이라이트 + 체크로 강조하는 기존 동작을 유지한다.
  selectedIid?: string | null;
  // 인벤토리 선택 판매 모드. 장착·잠금 카드는 서버 규칙과 동일하게 선택할 수 없다.
  saleSelection?: EquipmentSaleCardSelection;
  // 획득순에서 첫 카드가 최신임을 즉시 알아볼 수 있도록 표시한다.
  recentlyAcquiredIid?: string;
  // 인벤토리에서만 전달. 진행도 미달 장비는 보유·거래 가능하되 착용 잠금 배지를 표시한다.
  frontierDepth?: number;
}) {
  const selectable = selectedIid !== undefined;
  const saleSelectionActive = saleSelection?.active === true;
  if (cards.length === 0) {
    return (
      <EmptyState
        icon={<Diamond size={40} weight="duotone" />}
        title="보유한 장비가 없습니다"
        message="사냥터 드랍이나 거래소, 제작으로 모을 수 있습니다."
      />
    );
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      {cards.map(({ inst, isEquipped }) => {
        const item = V2_EQUIPMENT[inst.id];
        const { Icon, color } = SLOT_ICON[item.slot];
        const pct = rollQualityPct(item, inst.roll);
        const isSelected = selectable && inst.iid === selectedIid;
        const isSaleSelected =
          saleSelectionActive && saleSelection.selectedIids.has(inst.iid);
        const saleBlockedReason = isEquipped
          ? "장착 중"
          : inst.locked
            ? "잠금됨"
            : null;
        const highlighted = saleSelectionActive
          ? isSaleSelected
          : selectable
            ? isSelected
            : isEquipped;
        const progressionLock =
          frontierDepth == null
            ? null
            : equipmentProgressionLock(item, frontierDepth);
        return (
          <div
            key={inst.iid}
            className={`ui-equipment-card ui-item-rarity-t${item.tier} ui-game-card ui-lift-card relative flex min-h-11 flex-col gap-0.5 rounded-xl border p-2 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-1 focus-visible:ring-offset-white dark:focus-visible:ring-violet-400 dark:focus-visible:ring-offset-zinc-950 ${
              isSaleSelected
                ? "is-active border-rose-400 bg-rose-50 ring-1 ring-rose-200 dark:border-rose-500 dark:bg-rose-950 dark:ring-rose-900/70"
                : highlighted
                ? "is-active border-emerald-400 bg-emerald-50 ring-1 ring-emerald-200 dark:border-emerald-500 dark:bg-emerald-950 dark:ring-emerald-900/70"
                : "border-zinc-300 bg-zinc-50 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-900"
            }`}
          >
            <button
              type="button"
              onClick={(event) =>
                saleSelectionActive
                  ? saleSelection.onToggle(inst)
                  : onOpenCard(inst, anchorOf(event.currentTarget))
              }
              disabled={saleSelectionActive && saleBlockedReason !== null}
              aria-label={
                saleSelectionActive
                  ? saleBlockedReason
                    ? `${item.name} 판매 선택 불가: ${saleBlockedReason}`
                    : `${item.name} 판매 ${isSaleSelected ? "선택됨" : "선택 안 됨"}`
                  : `${item.name} 정보`
              }
              aria-pressed={saleSelectionActive ? isSaleSelected : undefined}
              className="absolute inset-0 z-0 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500 dark:focus-visible:ring-violet-400"
            />
            <div className="pointer-events-none relative z-10 flex items-start justify-between gap-1">
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
                {inst.iid === recentlyAcquiredIid ? (
                  <span
                    aria-label="가장 최근에 획득한 장비"
                    className="rounded-md border border-violet-300 bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-200"
                  >
                    최신 획득
                  </span>
                ) : null}
              </span>
              <span className="flex shrink-0 items-center gap-1">
                {isSaleSelected ? (
                  <CheckCircle
                    size={18}
                    weight="fill"
                    className="text-rose-500"
                    aria-hidden
                  />
                ) : null}
                {pct != null && (
                  <span
                    className="inline-flex items-center gap-1 text-[11px] font-semibold tabular-nums"
                    title="품질"
                  >
                    <QualityPctText pct={pct} />
                  </span>
                )}
                {isEquipped && (selectable || saleSelectionActive) ? (
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
            <div className="pointer-events-none relative z-10 flex min-w-0 items-center gap-1.5">
              <span
                className={`min-w-0 truncate text-sm font-semibold leading-tight ${powerNameClass(item, inst.roll, inst.enhance, inst.craftQuality)}`}
              >
                {item.name}
              </span>
              <ItemTypeChip item={item} />
            </div>
            <div className="pointer-events-none relative z-10 flex min-w-0 flex-wrap items-center gap-1">
              <EquipmentTierBadge tier={item.tier} compact />
              <EquipmentCodexBadge
                itemId={item.id}
                onRegister={
                  onRegisterCodex ? () => onRegisterCodex(inst) : undefined
                }
                busy={codexBusyIid === inst.iid}
              />
              <EnhanceLevelBadge enhance={inst.enhance} />
              <CraftQualityBadge craftQuality={inst.craftQuality} />
              {inst.craftedBy?.masterwork ? <MasterworkBadge /> : null}
              {inst.stormRefined ? (
                <span
                  className="rounded bg-violet-600 px-1.5 py-px text-[10px] font-semibold text-white"
                  title="특화 효과와 굴림 품질을 유지한 6T 위력 개량 장비"
                >
                  폭풍 개량
                </span>
              ) : null}
              {item.craftOnly ? <CraftOnlyBadge /> : null}
              {progressionLock ? (
                <span
                  className="rounded border border-amber-300 bg-amber-50 px-1.5 py-px text-[10px] font-semibold text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
                  title={`착용 조건: ${progressionLock.label}`}
                >
                  진행 잠금
                </span>
              ) : null}
            </div>
            <div className="pointer-events-none relative z-10 line-clamp-1 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
              {cardStatLine(item, inst.roll, inst.enhance, inst.craftQuality)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
