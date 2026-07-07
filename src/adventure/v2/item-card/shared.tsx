"use client";

import {
  craftQualityStars,
  powerWithBonuses,
  scaledEquipWeight,
  v2EquipCatalogTierToDisplayTier,
  v2EquipCatalogTierDisplayLabel,
  v2EquipPowerLabel,
  type V2CraftQualityState,
  type V2Equipment,
  type V2EquipOptions,
  type V2EquipRoll,
  type V2EquipSlot,
  type V2EquipStatRow,
  type V2EquipCatalogTier,
} from "@/adventure/data/v2/v2Equipment";
import { VARIANCE_FRACTION } from "@/adventure/data/v2/v2EquipVariance";
import type { V2EnhanceState } from "@/adventure/data/v2/v2Enhance";

const QUALITY_PRISM_TEXT_GRADIENT =
  "linear-gradient(100deg,#a8648b,#bc884a,#7f9a67,#5f9aac,#8874ad,#b16d94)";

// 굴림 품질 % → 색. 색 기준은 위력이 아니라 같은 장비 안에서의 개체 굴림 품질이다.
// 인벤 카드 배지와 공유 — V2InventoryView 가 여기서 import(기존 import 방향 유지).
export function rollPctClass(pct: number): string {
  if (pct >= 88) return "text-rose-600 dark:text-rose-400";
  if (pct >= 75) return "text-amber-600 dark:text-amber-400";
  if (pct >= 60) return "text-violet-600 dark:text-violet-400";
  if (pct >= 40) return "text-sky-600 dark:text-sky-400";
  return "text-zinc-500 dark:text-zinc-400";
}

type ItemNamePowerThresholds = readonly [
  sky: number,
  violet: number,
  amber: number,
  orange: number,
  rose: number,
  red: number,
];

// 장비명 색상표 — 무기 200/400/600/800/1000/1200 기준을 부위별 최대 위력 비율로 환산.
const ITEM_NAME_POWER_THRESHOLDS: Record<
  V2EquipSlot,
  ItemNamePowerThresholds
> = {
  weapon: [200, 400, 600, 800, 1000, 1200],
  armor: [70, 140, 210, 280, 350, 420],
  gloves: [20, 40, 60, 80, 100, 120],
  boots: [20, 40, 60, 80, 100, 120],
  ring: [20, 40, 55, 75, 90, 110],
  necklace: [20, 40, 60, 80, 100, 120],
};

// 장비명 색 → 현재 표시 위력 기준. 품질% 색은 QualityPctText 쪽에만 남긴다.
// 시그니처 효과 장비는 위력대와 무관하게 무지개로 고정한다.
export function itemNameClass(
  item: V2Equipment,
  roll?: V2EquipRoll,
  enhance?: V2EnhanceState,
  craftQuality?: V2CraftQualityState,
): string {
  if (item.signature) return "ui-item-name-signature";
  const displayPower = powerWithBonuses(
    roll?.power ?? item.power,
    enhance,
    craftQuality,
  );
  const [sky, violet, amber, orange, rose, red] =
    ITEM_NAME_POWER_THRESHOLDS[item.slot];
  if (displayPower >= red) return "text-red-600 dark:text-red-400";
  if (displayPower >= rose) return "text-rose-600 dark:text-rose-400";
  if (displayPower >= orange) return "text-orange-600 dark:text-orange-400";
  if (displayPower >= amber) return "text-amber-600 dark:text-amber-400";
  if (displayPower >= violet) return "text-violet-600 dark:text-violet-400";
  if (displayPower >= sky) return "text-sky-600 dark:text-sky-400";
  return "text-zinc-900 dark:text-zinc-100";
}

// 예전 이름은 import 호환을 위해 유지한다.
export function powerNameClass(
  item: V2Equipment,
  roll?: V2EquipRoll,
  enhance?: V2EnhanceState,
  craftQuality?: V2CraftQualityState,
): string {
  return itemNameClass(item, roll, enhance, craftQuality);
}

export function QualityPctText({
  pct,
  className = "",
}: {
  pct: number;
  className?: string;
}) {
  const perfect = pct >= 100;
  return (
    <span
      className={`${className} ${
        perfect
          ? "bg-clip-text font-semibold text-transparent"
          : rollPctClass(pct)
      }`}
      style={
        perfect
          ? {
              backgroundImage: QUALITY_PRISM_TEXT_GRADIENT,
              filter: "saturate(0.78)",
            }
          : undefined
      }
    >
      {pct}%
    </span>
  );
}

export function CraftOnlyBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`shrink-0 rounded bg-emerald-100 px-1.5 py-px text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 ${className}`}
    >
      제작 전용
    </span>
  );
}

export function EnhanceLevelBadge({
  enhance,
  level,
  className = "",
}: {
  enhance?: V2EnhanceState;
  level?: number;
  className?: string;
}) {
  const safeLevel = Math.max(
    0,
    Math.floor(Number(level ?? enhance?.level ?? 0) || 0),
  );
  if (safeLevel <= 0) return null;
  return (
    <span
      className={`shrink-0 rounded bg-sky-100 px-1.5 py-px text-[10px] font-semibold text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 ${className}`}
      title={`강화 +${safeLevel}`}
      aria-label={`강화 +${safeLevel}`}
    >
      강화 +{safeLevel}
    </span>
  );
}

export function CraftQualityStars({
  craftQuality,
  className = "",
}: {
  craftQuality?: V2CraftQualityState;
  className?: string;
}) {
  const stars = craftQualityStars(craftQuality);
  if (!stars) return null;
  return (
    <span
      className={`shrink-0 font-semibold tracking-normal text-amber-500 ${className}`}
      title={`제작 품질 ${craftQuality?.level ?? 0}`}
      aria-label={`제작 품질 ${craftQuality?.level ?? 0}`}
    >
      {stars}
    </span>
  );
}

export function CraftQualityBadge({
  craftQuality,
  level,
  className = "",
}: {
  craftQuality?: V2CraftQualityState;
  level?: number;
  className?: string;
}) {
  const safeLevel = Math.max(
    0,
    Math.floor(Number(level ?? craftQuality?.level ?? 0) || 0),
  );
  if (safeLevel <= 0) return null;
  const stars = "★".repeat(safeLevel);
  return (
    <span
      className={`shrink-0 rounded bg-amber-100 px-1.5 py-px text-[10px] font-semibold text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 ${className}`}
      title={`제작 품질 ${safeLevel}`}
      aria-label={`제작 품질 ${safeLevel}`}
    >
      {stars} 품질
    </span>
  );
}

export function MasterworkBadge({
  className = "",
}: {
  className?: string;
}) {
  return (
    <span
      className={`shrink-0 rounded bg-rose-100 px-1.5 py-px text-[10px] font-semibold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 ${className}`}
    >
      명장 제작품
    </span>
  );
}

// 세트 보너스(V2EquipOptions) → 표시 문자열. crit/eva = %, mp/hp = flat.
const SET_BONUS_LABEL: Record<keyof V2EquipOptions, string> = {
  crit: "치명",
  eva: "회피",
  mp: "MP",
  hp: "HP",
  critMult: "치명피해",
  spd: "속도",
  def: "방어",
  magicDef: "마법방어",
  healPowerPct: "회복",
  critResist: "치명저항",
};
export function formatSetBonus(bonus: Readonly<V2EquipOptions>): string {
  return (Object.keys(SET_BONUS_LABEL) as (keyof V2EquipOptions)[])
    .filter((k) => bonus[k])
    .map((k) => {
      // critMult 은 백분의 일 정수(30=+0.30×). crit/eva/healPowerPct = %, 그 외 flat.
      if (k === "critMult")
        return `${SET_BONUS_LABEL[k]} +${((bonus[k] ?? 0) / 100).toFixed(2)}×`;
      const unit =
        k === "crit" || k === "eva" || k === "healPowerPct" || k === "critResist"
          ? "%"
          : "";
      return `${SET_BONUS_LABEL[k]} +${bonus[k]}${unit}`;
    })
    .join(", ");
}

// 스탯 한 줄 — 라벨(좌) + 값(우). 기본 스탯·옵션이 같은 표기를 공유.
export function StatRow({ row }: { row: V2EquipStatRow }) {
  return (
    <div className="flex items-start justify-between gap-2 text-xs">
      <span className="shrink-0 text-zinc-500 dark:text-zinc-400">
        {row.label}
      </span>
      <span className="min-w-0 text-right tabular-nums text-emerald-600 dark:text-emerald-400">
        {row.value}
      </span>
    </div>
  );
}

const RANGE_OPTION_LABEL_TO_KEY: Partial<Record<string, keyof V2EquipOptions>> =
  {
    치명: "crit",
    회피: "eva",
    MP: "mp",
    HP: "hp",
    속도: "spd",
    치명피해: "critMult",
    방어: "def",
    마법방어: "magicDef",
    회복: "healPowerPct",
    치명저항: "critResist",
  };

function rollRange(
  value: number,
  floor: number,
): { lo: number; hi: number } | null {
  const spread = Math.round(value * VARIANCE_FRACTION);
  if (spread <= 0) return null;
  return { lo: Math.max(floor, value - spread), hi: value + spread };
}

function formatRangeValue(label: string, value: number): string {
  if (label === "무게") return `${value}`;
  if (label === "치명피해") return `+${(value / 100).toFixed(2)}×`;
  if (
    label === "치명" ||
    label === "회피" ||
    label === "회복" ||
    label === "치명저항"
  ) {
    return `+${value}%`;
  }
  return `+${value}`;
}

export function statRowWithRollRange(
  item: V2Equipment,
  row: V2EquipStatRow,
  roll: V2EquipRoll | undefined,
  enhance: V2EnhanceState | undefined,
  craftQuality: V2CraftQualityState | undefined,
): V2EquipStatRow {
  if (!roll) return row;

  const powerLabel = v2EquipPowerLabel(item);
  if (row.label === powerLabel) {
    const range = rollRange(item.power, 1);
    if (!range) return row;
    return {
      ...row,
      value: `${row.value} (${formatRangeValue(
        row.label,
        powerWithBonuses(range.lo, enhance, craftQuality),
      )} - ${formatRangeValue(
        row.label,
        powerWithBonuses(range.hi, enhance, craftQuality),
      )})`,
    };
  }

  if (row.label === "무게") {
    const range = rollRange(item.weight, 0);
    if (!range) return row;
    return {
      ...row,
      value: `${row.value} (${scaledEquipWeight(
        item,
        range.lo,
      )} - ${scaledEquipWeight(item, range.hi)})`,
    };
  }

  const optionKey = RANGE_OPTION_LABEL_TO_KEY[row.label];
  const base = optionKey ? item.options?.[optionKey] : undefined;
  if (base == null) return row;
  const range = rollRange(base, 1);
  if (!range) return row;
  return {
    ...row,
    value: `${row.value} (${formatRangeValue(
      row.label,
      range.lo,
    )} - ${formatRangeValue(row.label, range.hi)})`,
  };
}

export function EquipmentTierBadge({
  tier,
  compact = false,
  className = "",
}: {
  tier: V2EquipCatalogTier;
  compact?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`ui-equipment-tier-badge ui-equipment-display-tier-${v2EquipCatalogTierToDisplayTier(tier)} inline-flex shrink-0 items-center rounded-md border border-zinc-200 bg-white/80 font-semibold tabular-nums text-zinc-600 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/80 dark:text-zinc-300 ${
        compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]"
      } ${className}`}
    >
      {v2EquipCatalogTierDisplayLabel(tier)}
    </span>
  );
}

// 장비 아이템 옵션 카드 — 클릭한 슬롯 근처에 뜨는 플로팅 팝오버.
// 전체화면 모달 아님: 스크림/스크롤락/포커스트랩 없이, 바깥 클릭·Esc 로만 닫힘.
// 내용은 이름·티어 구간·옵션(스탯 행)·세트·설명을 노출한다. 컨셉 태그(힘/민/지 등)는 노출 안 함.

// 클릭한 슬롯의 화면 좌표 — 이 근처에 카드를 띄운다 (DOMRect 의 필요한 값만).
export type ItemCardAnchor = { top: number; bottom: number; left: number };

// 클릭한 엘리먼트의 화면 좌표 → 팝오버 앵커. 슬롯·행 onClick 에서 공유.
export function anchorOf(el: HTMLElement): ItemCardAnchor {
  const r = el.getBoundingClientRect();
  return { top: r.top, bottom: r.bottom, left: r.left };
}

export const WIDTH = 256; // 카드 폭(px)
export const GAP = 6; // 앵커와 카드 사이 간격
export const MARGIN = 8; // 뷰포트 가장자리 여백

export type ItemCardEquipAction = {
  isEquipped: boolean;
  busy: boolean;
  onEquip: () => void;
  onUnequip: () => void;
};

export type ItemCardCompareAction = {
  onCompare: () => void;
};

// 인벤토리에서만 주입 — 즐겨찾기 잠금 토글(헤더). 잠금 = 일괄/실수 판매 방지.
export type ItemCardLockAction = {
  locked: boolean;
  busy: boolean;
  onToggle: () => void;
};
