import { SURFACE_INSET } from "@/components/ui/surfaces";
import {
  cookingPost50Bonuses,
  farmingPost50Bonuses,
  fishingPost50Bonuses,
  miningPost50Bonuses,
  woodcuttingPost50Bonuses,
} from "./lifeLevelBonuses";

export type LifeMilestoneActivity =
  | "farming"
  | "woodcutting"
  | "mining"
  | "fishing"
  | "cooking";

const MILESTONE_LEVELS = [60, 75, 90, 100] as const;

function formatPercent(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value);
}

function milestoneEffects(
  activity: LifeMilestoneActivity,
  level: number,
): string[] {
  if (activity === "farming") {
    const bonus = farmingPost50Bonuses(level);
    return [
      `수확량 +${formatPercent(bonus.yieldBonusPct)}%`,
      `희귀 수확 +${formatPercent(bonus.rareChancePct)}%p`,
    ];
  }
  if (activity === "woodcutting") {
    const bonus = woodcuttingPost50Bonuses(level);
    return [
      `추가 원목 +${formatPercent(bonus.bonusLogChancePct)}%`,
      ...(bonus.seedChancePct > 0
        ? [`묘목 발견 +${formatPercent(bonus.seedChancePct)}%p`]
        : []),
      ...(bonus.rareResultChancePct > 0
        ? [`희귀 결과 +${formatPercent(bonus.rareResultChancePct)}%p`]
        : []),
    ];
  }
  if (activity === "mining") {
    const bonus = miningPost50Bonuses(level);
    return [
      `추가 광석 +${formatPercent(bonus.bonusOreChancePct)}%`,
      ...(bonus.byproductChancePct > 0
        ? [`부산물 발견 +${formatPercent(bonus.byproductChancePct)}%p`]
        : []),
      ...(bonus.rareByproductChancePct > 0
        ? [`희귀 부산물 +${formatPercent(bonus.rareByproductChancePct)}%p`]
        : []),
    ];
  }
  if (activity === "fishing") {
    const bonus = fishingPost50Bonuses(level);
    return [
      `물고기 크기 +${formatPercent(bonus.sizeBonusPct)}%`,
      `특별 손님 +${formatPercent(bonus.specialWeightPct)}%`,
      ...(bonus.rareSizeBonusPct > 0
        ? [`희귀 어종 크기 +${formatPercent(bonus.rareSizeBonusPct)}%`]
        : []),
      ...(bonus.bigCatchSizeBonusPct > 0
        ? [`대물 크기 +${formatPercent(bonus.bigCatchSizeBonusPct)}%`]
        : []),
    ];
  }
  const bonus = cookingPost50Bonuses(level);
  return [
    `걸작 확률 +${formatPercent(bonus.masterpieceChancePct)}%p`,
    ...(bonus.materialReductionPct > 0
      ? [`재료 절약 +${formatPercent(bonus.materialReductionPct)}%`]
      : []),
    ...(bonus.rareIngredientSaveChancePct > 0
      ? [`희귀 재료 보존 +${formatPercent(bonus.rareIngredientSaveChancePct)}%p`]
      : []),
  ];
}

export function LifeLevelMilestoneNotice({
  activity,
  level,
}: {
  activity: LifeMilestoneActivity;
  level: number;
}) {
  const safeLevel = Math.max(1, Math.min(100, Math.floor(level) || 1));
  if (safeLevel < 50) return null;
  if (safeLevel >= 100) {
    return (
      <aside className={`${SURFACE_INSET} px-3 py-2 text-xs font-semibold text-zinc-800 dark:text-zinc-100`}>
        최종 숙련 달성 · MAX
      </aside>
    );
  }

  const nextLevel = MILESTONE_LEVELS.find(
    (milestoneLevel) => milestoneLevel > safeLevel,
  )!;
  return (
    <aside className={`${SURFACE_INSET} px-3 py-2 text-xs text-zinc-800 dark:text-zinc-100`}>
      <span className="font-semibold">다음 숙련 마일스톤 · Lv.{nextLevel}</span>
      <span className="ml-2 text-zinc-600 dark:text-zinc-300">
        {milestoneEffects(activity, nextLevel).join(" · ")}
      </span>
    </aside>
  );
}
