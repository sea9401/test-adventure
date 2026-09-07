import {
  aggregateEquippedPassives,
  V2_SKILLS,
  type V2SkillId,
} from "@/adventure/data/v2/v2Skills";
import { V2_STAT_LABELS, type V2StatKey } from "@/adventure/data/v2/v2StatKeys";
import {
  buildTagsForSkill,
  V2_BUILD_TAG_LABEL,
} from "@/adventure/data/v2/buildTags";

export type SkillLibraryViewMode = "detailed" | "compact" | "minimal";

export type EquippedPassiveSummaryItem = {
  id: string;
  label: string;
  conditional: boolean;
};

function formatSummaryNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

export function skillLibraryTags(skillId: string, limit = 3): string[] {
  const skill = V2_SKILLS[skillId as V2SkillId];
  if (!skill) return [];
  return buildTagsForSkill(skill)
    .map((tag) => V2_BUILD_TAG_LABEL[tag])
    .slice(0, Math.max(0, limit));
}

export function equippedPassiveSummary(
  skillIds: readonly string[],
): EquippedPassiveSummaryItem[] {
  const knownIds = skillIds.filter(
    (skillId): skillId is V2SkillId => skillId in V2_SKILLS,
  );
  const aggregate = aggregateEquippedPassives(knownIds);
  const items: EquippedPassiveSummaryItem[] = [];

  const add = (
    id: string,
    label: string,
    conditional = false,
  ): void => {
    items.push({ id, label, conditional });
  };

  for (const [stat, value] of Object.entries(aggregate.stat)) {
    if (!value) continue;
    add(`stat:${stat}`, `${V2_STAT_LABELS[stat as V2StatKey]} +${formatSummaryNumber(value)}`);
  }

  for (const [stat, value] of Object.entries(aggregate.statPct)) {
    if (!value) continue;
    add(
      `statPct:${stat}`,
      `${V2_STAT_LABELS[stat as V2StatKey]} +${formatSummaryNumber(value)}%`,
    );
  }

  const addPositivePct = (
    id: keyof typeof aggregate,
    label: string,
    conditional = false,
  ): void => {
    const value = aggregate[id];
    if (typeof value !== "number" || value === 0) return;
    add(id, `${label} +${formatSummaryNumber(value)}%`, conditional);
  };
  const addNegativePct = (
    id: keyof typeof aggregate,
    label: string,
    conditional = false,
  ): void => {
    const value = aggregate[id];
    if (typeof value !== "number" || value === 0) return;
    add(id, `${label} -${formatSummaryNumber(value)}%`, conditional);
  };

  addPositivePct("maxHpPct", "최대 HP");
  addPositivePct("maxMpPct", "최대 MP");
  addNegativePct("mpCostReductionPct", "마법 MP 소모");
  addPositivePct("freezeDamagePct", "빙결 피해", true);
  if (aggregate.freezeDelayPct) {
    add(
      "freezeDelayPct",
      `빙결 행동 지연 ${formatSummaryNumber(aggregate.freezeDelayPct)}%`,
      true,
    );
  }
  if (aggregate.freezeRetainStacks) {
    add(
      "freezeRetainStacks",
      `빙결 후 한기 ${formatSummaryNumber(aggregate.freezeRetainStacks)} 잔류`,
      true,
    );
  }
  if (aggregate.magicBarrier) add("magicBarrier", "마나 실드 활성화");
  if (aggregate.atkPerDexCoef) {
    add(
      "atkPerDexCoef",
      `민첩 ×${formatSummaryNumber(aggregate.atkPerDexCoef)} 공격력`,
    );
  }
  if (aggregate.atkPerLukCoef) {
    add(
      "atkPerLukCoef",
      `행운 ×${formatSummaryNumber(aggregate.atkPerLukCoef)} 공격력`,
    );
  }
  addPositivePct("critPct", "치명타 확률");
  addPositivePct("critDmgPct", "기본 공격 치명타 피해");
  addPositivePct("evasionPct", "회피도");
  addPositivePct("lifestealPct", "흡혈");
  if (aggregate.counterChancePct) {
    add(
      "counterChancePct",
      `HP 피해 시 반격 확률 ${formatSummaryNumber(aggregate.counterChancePct)}%`,
      true,
    );
  }
  if (aggregate.counterDamageUsesReflectBoost) {
    add(
      "counterDamageUsesReflectBoost",
      "반격에 반사 피해 증폭 적용",
      true,
    );
  }
  addPositivePct("defPct", "물리·마법 방어력");
  if (aggregate.thornsDefPct) {
    add(
      "thornsDefPct",
      `HP 피해 시 방어력의 ${formatSummaryNumber(aggregate.thornsDefPct)}% 반사`,
      true,
    );
  }
  if (aggregate.fortressImpactOnHit) {
    add("fortressImpactOnHit", "적 직접 공격 명중 시 충격 +1", true);
  }
  if (aggregate.fortressImpactDamagePctPerStack) {
    add(
      "fortressImpactDamagePctPerStack",
      `충격당 소비 공격 피해 +${formatSummaryNumber(aggregate.fortressImpactDamagePctPerStack)}%`,
      true,
    );
  }
  addPositivePct("fortressDefSkillStatCoefPct", "방어력 공격 계수");
  if (aggregate.lawInscription) {
    add("lawInscription", "장착 재료별 법칙 각인 생성", true);
  }
  addPositivePct("accuracyPct", "적중도");
  addPositivePct("healPowerPct", "회복");
  addNegativePct("damageTakenReductionPct", "받는 피해");
  addNegativePct("statusDamageReductionPct", "상태이상 피해");
  if (aggregate.bleedPhysicalSkillDamagePctPerStack) {
    add(
      "bleedPhysicalSkillDamagePctPerStack",
      `대상 출혈 스택당 물리 스킬 피해 +${formatSummaryNumber(aggregate.bleedPhysicalSkillDamagePctPerStack)}%`,
      true,
    );
  }
  if (aggregate.stoneskinDefPctPerWeight) {
    add(
      "stoneskinDefPctPerWeight",
      `중량당 방어력 +${formatSummaryNumber(aggregate.stoneskinDefPctPerWeight)}%`,
      true,
    );
  }
  addPositivePct("magicDefPct", "마법 방어력");
  if (aggregate.openingMagicDamageReductionPct) {
    add(
      "openingMagicDamageReductionPct",
      `초반 적 공격 ${formatSummaryNumber(aggregate.openingMagicDamageReductionPhases)}회 받는 마법 피해 -${formatSummaryNumber(aggregate.openingMagicDamageReductionPct)}%`,
      true,
    );
  }
  if (aggregate.tripleWardRank) {
    add(
      "tripleWardRank",
      `삼중 결계 각 ${aggregate.tripleWardRank === 1 ? 1 : 3}회`,
      true,
    );
  }
  addNegativePct("poisonedEnemyDefReductionPct", "중독 적 방어", true);
  addPositivePct("poisonDamagePct", "중독 피해");
  addNegativePct("enemyPhysicalDefReductionPct", "적 물리 방어");
  addNegativePct("enemyMagicDefReductionPct", "적 마법 방어");
  if (aggregate.berserkAtkPctPerLostHpPct) {
    add(
      "berserkAtkPctPerLostHpPct",
      `잃은 HP 1%당 공격력 +${formatSummaryNumber(aggregate.berserkAtkPctPerLostHpPct)}%`,
      true,
    );
  }
  if (aggregate.enemyMagicVulnPctPerStack) {
    add(
      "enemyMagicVulnPctPerStack",
      `마법취약 스택당 받는 스킬 피해 +${formatSummaryNumber(aggregate.enemyMagicVulnPctPerStack)}%`,
      true,
    );
  }
  if (aggregate.enemyMagicVulnApplyChancePct) {
    add(
      "enemyMagicVulnApplyChancePct",
      `마법취약 누적 확률 ${formatSummaryNumber(aggregate.enemyMagicVulnApplyChancePct)}%`,
      true,
    );
  }
  addPositivePct("magicSkillDamagePct", "마법 스킬 피해");
  addPositivePct(
    "singleHitPhysicalSkillDamagePct",
    "단일 타격 물리 스킬 피해",
    true,
  );
  if (aggregate.spdToAtkMaxPct) {
    add(
      "spdToAtkMaxPct",
      `속도 비례 공격력 최대 +${formatSummaryNumber(aggregate.spdToAtkMaxPct)}%`,
      true,
    );
  }
  if (aggregate.spdPerLukCoef) {
    add(
      "spdPerLukCoef",
      `행운 ×${formatSummaryNumber(aggregate.spdPerLukCoef)} 속도`,
    );
  }
  if (aggregate.skillCritOverflow) {
    add("skillCritOverflow", "치명타 한계 초과 보너스를 스킬에도 적용");
  }
  addPositivePct("skillCritDmgPct", "스킬 치명타 피해");
  if (aggregate.equipmentMagicSkillCritConversion) {
    add(
      "equipmentMagicSkillCritConversion",
      "장비 치명타 배율을 마법 스킬 치명타 배율로 변환",
    );
  }
  if (aggregate.skillCritAfterEvade) {
    add("skillCritAfterEvade", "회피 후 다음 직접 피해 스킬 확정 치명타", true);
  }
  addPositivePct("comboFinisherBonusPct", "4타마다 피해", true);
  if (aggregate.basicDefPenetrationPct) {
    add(
      "basicDefPenetrationPct",
      `평타 방어 관통 +${formatSummaryNumber(aggregate.basicDefPenetrationPct)}%p`,
    );
  }
  if (aggregate.basicCritHastePct) {
    add(
      "basicCritHastePct",
      `평타 치명타 시 다음 행동 간격 -${formatSummaryNumber(aggregate.basicCritHastePct)}%`,
      true,
    );
  }
  if (aggregate.basicCritChanceCap > 75) {
    add(
      "basicCritChanceCap",
      `평타 치명타 확률 상한 ${formatSummaryNumber(aggregate.basicCritChanceCap)}%`,
    );
  }
  if (aggregate.berserkerMadnessRank) {
    add(
      "berserkerMadnessRank",
      `광기 ${formatSummaryNumber(aggregate.berserkerMadnessRank)}단계`,
      true,
    );
  }

  return items;
}
