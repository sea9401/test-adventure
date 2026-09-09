"use client";

import {
  craftQualityStars,
  equipmentPowerDisplayValue,
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
import {
  formatLiberationOptionRoll,
  type V2LiberationState,
} from "@/adventure/data/v2/equipmentLiberation";
import { enchantmentStage } from "../liberation/equipmentLiberationViewModel";
import type { GameConfirmOptions } from "@/components/ui/gameDialog";
import { SURFACE_INSET } from "@/components/ui/surfaces";
import { V2_EQUIPMENT_LIBERATION } from "@/adventure/data/v2/coreLoopConfig";
import type { UnexploredSetEffect } from "@/adventure/data/v2/unexploredSpecialtyEquipment";

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

// 장비명 색 → 세트는 전용 청록색, 비세트 시그니처는 무지개로 통일한다.
// 둘에 해당하지 않는 유니크만 전용 보라색을 쓰고, 나머지는 현재 표시 위력 기준으로 나눈다.
export function itemNameClass(
  item: V2Equipment,
  roll?: V2EquipRoll,
  enhance?: V2EnhanceState,
  craftQuality?: V2CraftQualityState,
): string {
  if (item.setId) {
    return "text-emerald-600 dark:text-emerald-400";
  }
  if (item.signature) return "ui-item-name-signature";
  if (item.rarity === "unique") {
    return "text-purple-600 dark:text-purple-400";
  }
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
          ? "font-extrabold text-fuchsia-600 dark:text-fuchsia-300"
          : rollPctClass(pct)
      }`}
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

export function UniqueBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`shrink-0 rounded bg-purple-100 px-1.5 py-px text-[10px] font-semibold text-purple-700 dark:bg-purple-950 dark:text-purple-300 ${className}`}
    >
      유니크
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

export function LiberationBadge({
  liberation,
  className = "",
}: {
  liberation?: V2LiberationState;
  className?: string;
}) {
  if (!V2_EQUIPMENT_LIBERATION || !liberation) return null;
  return (
    <span
      className={`shrink-0 rounded bg-violet-100 px-1.5 py-px text-[10px] font-semibold text-violet-700 dark:bg-violet-950 dark:text-violet-300 ${className}`}
      title={`마법부여 ${enchantmentStage(liberation.rank)}단계 · ${liberation.lineCount}줄`}
    >
      마법부여 {enchantmentStage(liberation.rank)}단계 · {liberation.lineCount}줄
    </span>
  );
}

export function LiberationOptionsPanel({
  liberation,
}: {
  liberation: V2LiberationState;
}) {
  if (!V2_EQUIPMENT_LIBERATION) return null;
  return (
    <div className={`${SURFACE_INSET} mt-3 p-2.5`}>
      <div className="flex items-center justify-between gap-2 text-xs font-semibold text-violet-700 dark:text-violet-300">
        <span>마법부여 옵션</span>
        <span>마법부여 {enchantmentStage(liberation.rank)}단계 · {liberation.lineCount}줄</span>
      </div>
      <ul className="mt-2 space-y-1 text-xs">
        {liberation.options.map((option) => (
          <li key={option.id} className="flex items-start justify-between gap-2">
            <span>{formatLiberationOptionRoll(option)}</span>
            <span className="shrink-0 tabular-nums text-zinc-500 dark:text-zinc-400">
              Lv.{option.level}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export type BoundEquipmentDisposalItem = {
  iid: string;
  itemName: string;
  liberation?: V2LiberationState;
};

export function boundEquipmentDisposalConfirmation(
  items: readonly BoundEquipmentDisposalItem[],
  action: "판매" | "해체",
): GameConfirmOptions {
  const itemLines = items.map((item) =>
    item.liberation
      ? `• ${item.itemName} · 마법부여 ${enchantmentStage(item.liberation.rank)}단계 · ${item.liberation.lineCount}줄`
      : `• ${item.itemName} · 귀속 장비`,
  );
  return {
    title: `귀속 장비 ${action} 재확인`,
    message: [
      ...itemLines,
      "",
      `${action}하면 장비 귀속 및 모든 마법부여 옵션이 영구 소멸하며 되돌릴 수 없습니다.`,
    ].join("\n"),
    confirmLabel: `영구 소멸 확인 · ${action}`,
    tone: "danger",
  };
}

// 세트 보너스(V2EquipOptions) → 표시 문자열. 회피도·적중도는 고정 수치다.
const SET_BONUS_LABEL: Record<keyof V2EquipOptions, string> = {
  crit: "치명타",
  eva: "회피도",
  accuracy: "적중도",
  mp: "MP",
  hp: "HP",
  critMult: "치명타 피해",
  spd: "속도",
  def: "추가 방어력",
  magicDef: "마법방어",
  healPowerPct: "회복",
  critResist: "치명타 저항",
  statusDamageReductionPct: "상태이상 피해 감소",
  basicAttackDamagePct: "기본 공격 피해",
  extraBasicAttackDamagePct: "추가 기본 공격 피해",
  statusDotDamagePct: "상태 이상 지속 피해",
};
export function formatSetBonus(bonus: Readonly<V2EquipOptions>): string {
  return (Object.keys(SET_BONUS_LABEL) as (keyof V2EquipOptions)[])
    .filter((k) => bonus[k])
    .map((k) => {
      // critMult 은 백분의 일 정수(30=+0.30×). crit/healPowerPct = %, 그 외 flat.
      if (k === "critMult")
        return `${SET_BONUS_LABEL[k]} +${((bonus[k] ?? 0) / 100).toFixed(2)}×`;
      const unit =
        k === "crit" ||
        k === "healPowerPct" ||
        k === "critResist" ||
        k === "statusDamageReductionPct" ||
        k === "basicAttackDamagePct" ||
        k === "extraBasicAttackDamagePct" ||
        k === "statusDotDamagePct"
          ? "%"
          : "";
      return `${SET_BONUS_LABEL[k]} +${bonus[k]}${unit}`;
    })
    .join(", ");
}

const UNEXPLORED_EFFECT_DESCRIPTION: Record<UnexploredSetEffect["kind"], string> = {
  iron_wall: "직접 피해로 실제 HP가 감소하면 감소한 HP의 0.75%만큼 방어력을 누적합니다. 전투 시작 방어력의 100%까지 누적되며 전투 종료 시 초기화됩니다.",
  mana_redeployment: "전투 시작 시 최대 HP의 8% 보호막을 얻고, 스킬을 3번 사용할 때마다 같은 크기로 재전개합니다. 평타는 포함하지 않으며 보호막은 중첩하지 않고 더 높은 수치로만 갱신됩니다. 전투 종료 시 사용 횟수가 초기화됩니다.",
  colony_regeneration: "자신의 행동 종료 시 잃은 HP의 5%를 최대 HP의 2% 한도로 회복합니다. HP가 40% 이하라면 8%를 최대 HP의 3% 한도로 회복합니다. 회복량 증가는 적용되지 않으며 회복량 감소와 회복 불가 효과는 적용됩니다.",
  battle_revenge: "적의 한 행동에서 최대 HP의 5% 이상 실제 HP 피해를 받으면 중첩되지 않는 응징을 얻습니다. 다음 평타 또는 직접 피해 스킬의 최종 직접 피해가 20% 증가하고, 실제 직접 피해를 주면 소모됩니다. 회복·강화 행동과 완전 회피 시에는 유지되며 반격과 추가 공격에는 적용되거나 소모되지 않습니다.",
  crystal_focus: "MP를 실제 소모하는 직접 피해 스킬을 사용할 때 집속 횟수가 증가하고, 세 번째 스킬의 최종 직접 피해가 25% 증가합니다. 다단 공격은 1회로 계산하며 평타·무료 스킬·회복·강화 스킬·지속 피해는 제외됩니다. MP는 반환하지 않고 완전 회피에도 집속을 소모하며 전투 종료 시 초기화됩니다.",
  precision_shot: "직접 사용한 네 번째 기본 공격은 완전 회피를 제외한 일반 명중 판정에서 빗나가지 않으며 최종 피해가 50% 증가합니다. 치명타와 적중 시 상태 이상은 정상 발동하지만 별도 추가 공격은 만들지 않습니다. 반격과 추가 공격은 횟수에서 제외되며 전투 종료 시 초기화됩니다.",
  chain_drive: "직접 피해 스킬이 적중하면 스킬당 한 번 25% 확률로 평타의 60%인 추가 기본 공격을 실행합니다. 2세트 효과 적용 시 72%가 되며 치명타와 적중 시 상태 이상도 발동합니다. 다단 스킬은 한 번만 판정하고, 추가 공격은 재귀 발동하지 않으며 회복·강화 스킬과 지속 피해는 제외됩니다.",
  afterimage_coating: "적의 한 행동이 끝나면 그 행동에서 회피로 줄인 직접 피해 총량의 15%만큼 보호막을 얻습니다. 최대 HP의 3%까지 축적되며 다단 공격은 합산 후 한 번만 생성됩니다. 지속 피해와 완전 회피로는 생성되지 않고 전투 종료 시 제거됩니다.",
  unyielding_dead: "개별 피해를 받기 직전 HP가 35% 이하라면 평타·직접 피해 스킬과 중독·출혈·연소의 최종 피해를 15% 줄입니다. 35%를 초과하면 비활성화되며 피해로 기준 이하가 된 타격에는 적용되지 않고 다음 타격부터 적용됩니다. 다른 피해 감소와 곱연산하며 최소 피해 1을 유지합니다.",
  frost_mark: "평타 또는 직접 피해 스킬이 치명타로 적중하면 대상의 속도를 12% 낮춥니다. 대상 행동 2회 동안 유지됩니다.",
  freezing_lock: "서리 표식의 속도 감소를 20%로 강화하고, 유지되는 동안 대상의 명중이 12 감소합니다. 효과는 중첩하지 않고 재발동 시 지속시간만 갱신하며 다단 스킬은 한 번만 발동합니다. 지속 피해와 독립 추가 피해는 제외되고 한기 스택과 빙결에는 영향을 주지 않습니다.",
  colossus_crush: "평타와 직접 피해 스킬이 피해 유형에 대응하는 대상 방어력의 10%를 조건 없이 무시합니다. 물리 피해는 방어력, 마법 피해는 마법 방어력을 무시하며 지속 피해·반사 피해·독립 추가 공격에는 적용하지 않습니다. 세 부위 속도 감소 합계 12가 고정 대가입니다.",
};

export function unexploredSetEffectDescription(effect: UnexploredSetEffect): string {
  return UNEXPLORED_EFFECT_DESCRIPTION[effect.kind];
}

export function unexploredTagSetBonusDescription(setId: string): string | null {
  if (setId !== "unexplored_triad_decay") return null;
  return "상태 이상 지속 피해 증가는 착용자가 부여한 중독·출혈·연소의 주기 피해에만 적용합니다. 상태 이상 부여 확률·스택 수와 즉발 피해와 부가 효과에는 적용되지 않으며, 같은 종류의 증가 효과끼리는 합연산합니다.";
}

// 스탯 한 줄 — 라벨(좌) + 값(우). 기본 스탯·옵션이 같은 표기를 공유.
export function StatRow({ row }: { row: V2EquipStatRow }) {
  return (
    <div className="flex items-start justify-between gap-2 text-xs">
      <span className="shrink-0 text-zinc-500 dark:text-zinc-400">
        {row.label}
      </span>
      <span className="min-w-0 text-right tabular-nums">
        <span className="block text-emerald-600 dark:text-emerald-400">
          {row.value}
        </span>
        {row.detail ? (
          <span className="mt-0.5 block text-[10px] leading-tight text-zinc-500 dark:text-zinc-400">
            {row.detail}
          </span>
        ) : null}
      </span>
    </div>
  );
}

const RANGE_OPTION_LABEL_TO_KEY: Partial<Record<string, keyof V2EquipOptions>> =
  {
    치명타: "crit",
    "추가 회피도": "eva",
    "추가 적중도": "accuracy",
    MP: "mp",
    HP: "hp",
    속도: "spd",
    "치명타 피해": "critMult",
    "추가 방어력": "def",
    마법방어: "magicDef",
    회복: "healPowerPct",
    "치명타 저항": "critResist",
    "상태이상 피해 감소": "statusDamageReductionPct",
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
  if (label === "치명타 피해") return `+${(value / 100).toFixed(2)}×`;
  if (
    label === "치명타" ||
    label === "회피" ||
    label === "회복" ||
    label === "치명타 저항"
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
        equipmentPowerDisplayValue(
          powerWithBonuses(range.lo, enhance, craftQuality),
        ),
      )} - ${formatRangeValue(
        row.label,
        equipmentPowerDisplayValue(
          powerWithBonuses(range.hi, enhance, craftQuality),
        ),
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

export const WIDTH = 288; // 카드 폭(px)
export const GAP = 6; // 앵커와 카드 사이 간격
export const MARGIN = 8; // 뷰포트 가장자리 여백

export type ItemCardEquipAction = {
  isEquipped: boolean;
  busy: boolean;
  /** 진행도 등으로 새 장착이 불가능할 때 표시할 사용자 안내. 해제는 항상 허용한다. */
  disabledReason?: string;
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
