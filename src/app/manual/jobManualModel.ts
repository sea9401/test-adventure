import { STAT_LABELS } from "@/adventure/data/stats";
import {
  LEGACY_CLASS_SPEC_BY_JOB,
  V2_JOB_CATALOG,
  V2_JOB_LIST,
  isLifestyleMasteryJobId,
  jobUnlockConditionText,
  type ExtraJobCondition,
  type V2JobDefinition,
} from "@/adventure/data/v2/v2JobCatalog";
import {
  V2_SKILLS,
  describeV2Effects,
  describeV2Skill,
  spCostOf,
  v2SkillLearnCost,
  v2SkillMpCostValue,
  type V2SkillDefinition,
  type V2SkillId,
} from "@/adventure/data/v2/v2Skills";
import { skillsForJob } from "@/adventure/data/v2/v2SkillsByJob";
import {
  TIER7_FIRST_UNLOCK_LEVEL,
  TIER7_FIRST_UNLOCK_MATERIAL_COST,
  TIER7_FIRST_UNLOCK_MATERIAL_ID,
} from "@/adventure/data/v2/tier7Advancement";
import { isTier7CombatJobId } from "@/adventure/data/v2/tier7Jobs";
import { STORM_EXPEDITION_MATERIALS } from "@/adventure/data/v2/stormExpeditionRewards";
import {
  V2_STAT_KEYS,
  V2_STAT_LABELS,
  type V2StatKey,
} from "@/adventure/data/v2/v2StatKeys";
import {
  jobManualGuideFor,
  type JobManualGuide,
} from "./jobManualGuides";

export type JobManualKind = "combat" | "life";
export type JobManualLine =
  | "adventurer"
  | "warrior"
  | "martial"
  | "mage"
  | "rogue"
  | "survivor"
  | "mutant"
  | "hybrid";

export type JobManualClassification = {
  kind: JobManualKind;
  kindLabel: string;
  line: JobManualLine;
  lineLabel: string;
};

export type JobManualRelation = {
  id: string;
  name: string;
  requiredMastery: number | null;
};

export type JobManualStatValue = {
  stat: V2StatKey;
  label: string;
  value: number;
};

export type JobManualVariant = {
  name: string;
  requiredLearnedSkillIds: string[];
  requiredLearnedSkillNames: string[];
  requiredEquippedSkillIds: string[];
  requiredEquippedSkillNames: string[];
  effectLines: string[];
};

export type JobManualSynergy = {
  requiredSkillIds: string[];
  requiredSkillNames: string[];
  effectLines: string[];
};

export type JobManualSkill = {
  id: string;
  name: string;
  category: V2SkillDefinition["category"];
  categoryLabel: string;
  tier: 1 | 2 | 3;
  stat: string;
  statLabel: string;
  spCost: number;
  learnCost: number;
  mpCost: number;
  cooldown: number;
  procChance: number | null;
  description: string;
  effectLines: string[];
  variants: JobManualVariant[];
  synergies: JobManualSynergy[];
};

export type JobManualIndexEntry = {
  id: string;
  name: string;
  tier: number;
  kind: JobManualKind;
  line: JobManualLine;
  lineLabel: string;
  primaryStats: string[];
  skillNames: string[];
  searchText: string;
};

export type JobManualEntry = JobManualIndexEntry & {
  classification: JobManualClassification;
  summary: string;
  unlockText: string;
  prerequisites: JobManualRelation[];
  additionalUnlockConditions: string[];
  nextJobs: JobManualRelation[];
  jobBonuses: JobManualStatValue[];
  cultivation: JobManualStatValue[];
  skills: JobManualSkill[];
  guide: JobManualGuide | null;
};

const KIND_LABELS: Record<JobManualKind, string> = {
  combat: "전투",
  life: "생활",
};

export const JOB_MANUAL_LINE_LABELS: Record<JobManualLine, string> = {
  adventurer: "모험가",
  warrior: "전사",
  martial: "무도가",
  mage: "마법사",
  rogue: "도적",
  survivor: "생존자",
  mutant: "변이자",
  hybrid: "복합",
};

const ROOT_LINES = new Set<JobManualLine>([
  "warrior",
  "martial",
  "mage",
  "rogue",
  "survivor",
  "mutant",
]);

const CATEGORY_LABELS: Record<V2SkillDefinition["category"], string> = {
  attack: "공격",
  heal: "회복",
  buff: "강화",
  debuff: "약화",
  passive: "항시",
};

function prerequisiteIds(job: V2JobDefinition): string[] {
  return [
    ...Object.keys(job.unlock.prereqs),
    ...(job.unlock.extraConditions ?? [])
      .filter((condition) => condition.type === "jobUnlocked")
      .map((condition) => condition.jobId),
  ];
}

function collectLineageRoots(jobId: string, seen = new Set<string>()): Set<JobManualLine> {
  if (seen.has(jobId)) return new Set();
  seen.add(jobId);

  const roots = new Set<JobManualLine>();
  const legacyClass = LEGACY_CLASS_SPEC_BY_JOB[jobId]?.class as
    | JobManualLine
    | undefined;
  if (legacyClass && ROOT_LINES.has(legacyClass)) roots.add(legacyClass);

  const job = V2_JOB_CATALOG[jobId];
  if (!job) return roots;
  for (const parentId of prerequisiteIds(job)) {
    for (const root of collectLineageRoots(parentId, seen)) roots.add(root);
  }
  return roots;
}

function classificationFor(job: V2JobDefinition): JobManualClassification {
  const kind: JobManualKind = isLifestyleMasteryJobId(job.id) ? "life" : "combat";
  const roots = collectLineageRoots(job.id);
  const line: JobManualLine =
    job.id === "none"
      ? "adventurer"
      : roots.size > 1
        ? "hybrid"
        : (roots.values().next().value ?? "adventurer");
  return {
    kind,
    kindLabel: KIND_LABELS[kind],
    line,
    lineLabel: JOB_MANUAL_LINE_LABELS[line],
  };
}

function statValues(
  values: Partial<Record<V2StatKey, number>>,
): JobManualStatValue[] {
  return V2_STAT_KEYS.flatMap((stat) => {
    const value = values[stat] ?? 0;
    return value === 0
      ? []
      : [{ stat, label: V2_STAT_LABELS[stat], value }];
  }).sort((a, b) => b.value - a.value);
}

function resolveSkill(skillId: V2SkillId, owner: string): V2SkillDefinition {
  const skill = V2_SKILLS[skillId];
  if (!skill) {
    throw new Error(`${owner} references missing skill ${skillId}`);
  }
  return skill;
}

function skillNames(skillIds: readonly V2SkillId[] | undefined, owner: string): string[] {
  return (skillIds ?? []).map((skillId) => resolveSkill(skillId, owner).name);
}

function skillModel(skill: V2SkillDefinition): JobManualSkill {
  const variants = (skill.castVariants ?? []).map((variant) => ({
    name: variant.name,
    requiredLearnedSkillIds: [...(variant.requiredLearnedSkillIds ?? [])],
    requiredLearnedSkillNames: skillNames(
      variant.requiredLearnedSkillIds,
      `${skill.id} variant ${variant.name}`,
    ),
    requiredEquippedSkillIds: [...(variant.requiredEquippedSkillIds ?? [])],
    requiredEquippedSkillNames: skillNames(
      variant.requiredEquippedSkillIds,
      `${skill.id} variant ${variant.name}`,
    ),
    effectLines: describeV2Effects(
      variant.effects,
      skill.tier,
      skill.monsterOnly === true,
    ),
  }));
  const synergies = (skill.equippedSynergies ?? []).map((synergy) => {
    const requiredSkillIds = [
      ...(synergy.requiredSkillId ? [synergy.requiredSkillId] : []),
      ...(synergy.requiredSkillIds ?? []),
    ].filter((skillId, index, ids) => ids.indexOf(skillId) === index);
    return {
      requiredSkillIds,
      requiredSkillNames: skillNames(
        requiredSkillIds,
        `${skill.id} equipped synergy`,
      ),
      effectLines: describeV2Effects(
        synergy.effects,
        skill.tier,
        skill.monsterOnly === true,
      ),
    };
  });

  return {
    id: skill.id,
    name: skill.name,
    category: skill.category,
    categoryLabel: CATEGORY_LABELS[skill.category],
    tier: skill.tier,
    stat: skill.stat,
    statLabel: STAT_LABELS[skill.stat],
    spCost: spCostOf(skill),
    learnCost: v2SkillLearnCost(skill.id),
    mpCost: v2SkillMpCostValue(skill),
    cooldown: skill.cooldown,
    procChance: skill.category === "passive" ? null : (skill.procChance ?? 100),
    description: skill.description,
    effectLines: describeV2Skill(skill),
    variants,
    synergies,
  };
}

function relationFor(jobId: string, requiredMastery: number | null): JobManualRelation {
  return {
    id: jobId,
    name: V2_JOB_CATALOG[jobId]?.name ?? jobId,
    requiredMastery,
  };
}

function prerequisiteRelations(job: V2JobDefinition): JobManualRelation[] {
  const relations = Object.entries(job.unlock.prereqs).map(([jobId, mastery]) =>
    relationFor(jobId, mastery ?? 0),
  );
  for (const condition of job.unlock.extraConditions ?? []) {
    if (
      condition.type === "jobUnlocked" &&
      !relations.some((relation) => relation.id === condition.jobId)
    ) {
      relations.push(relationFor(condition.jobId, null));
    }
  }
  return relations;
}

function additionalConditionText(condition: ExtraJobCondition): string | null {
  switch (condition.type) {
    case "jobUnlocked":
      return null;
    case "farmingLevel":
      return `농사 Lv ${condition.min}`;
    case "cookingLevel":
      return `요리 Lv ${condition.min}`;
    case "woodcuttingLevel":
      return `벌목 Lv ${condition.min}`;
    case "miningLevel":
      return `채광 Lv ${condition.min}`;
    case "statThreshold":
      return `${V2_STAT_LABELS[condition.stat]} 수행 한계 ${condition.min}`;
    case "questCompleted":
      return `퀘스트 ${condition.questId} 완료`;
    case "monsterKilled":
      return `${condition.monsterId} 처치 ${condition.minCount}회`;
  }
}

function tier7UnlockConditions(jobId: string): string[] {
  if (!isTier7CombatJobId(jobId)) return [];
  const materialName =
    STORM_EXPEDITION_MATERIALS[TIER7_FIRST_UNLOCK_MATERIAL_ID].name;
  return [
    `선행 직업 중 하나로 Lv ${TIER7_FIRST_UNLOCK_LEVEL}`,
    `최초 해금: ${materialName} ${TIER7_FIRST_UNLOCK_MATERIAL_COST}개`,
    "해금 후 영구 유지",
  ];
}

function nextJobRelations(jobId: string): JobManualRelation[] {
  return V2_JOB_LIST.flatMap((candidate) => {
    const mastery = candidate.unlock.prereqs[jobId];
    const unlockedCondition = (candidate.unlock.extraConditions ?? []).some(
      (condition) => condition.type === "jobUnlocked" && condition.jobId === jobId,
    );
    if (mastery == null && !unlockedCondition) return [];
    return [relationFor(candidate.id, mastery ?? null)];
  });
}

function indexEntry(job: V2JobDefinition): JobManualIndexEntry {
  const classification = classificationFor(job);
  const skills = skillsForJob(job.id).map((skillId) => resolveSkill(skillId, job.id));
  const primaryStats = statValues(job.cultivateProfile).map((entry) => entry.label);
  const skillNames = skills.map((skill) => skill.name);
  return {
    id: job.id,
    name: job.name,
    tier: job.tier,
    kind: classification.kind,
    line: classification.line,
    lineLabel: classification.lineLabel,
    primaryStats,
    skillNames,
    searchText: [job.id, job.name, classification.lineLabel, ...primaryStats, ...skillNames]
      .join(" ")
      .toLocaleLowerCase("ko-KR"),
  };
}

export function buildJobManualIndex(): JobManualIndexEntry[] {
  return V2_JOB_LIST.map(indexEntry);
}

export function buildJobManualEntry(jobId: string): JobManualEntry | null {
  const job = V2_JOB_CATALOG[jobId];
  if (!job) return null;

  const index = indexEntry(job);
  const classification = classificationFor(job);
  const skills = skillsForJob(job.id).map((skillId) =>
    skillModel(resolveSkill(skillId, job.id)),
  );
  const tierLabel = job.tier === 0 ? "기본" : `${job.tier}차`;
  const statSummary = index.primaryStats.length
    ? `${index.primaryStats.join("·")} 수행`
    : "수행 보정 없음";
  return {
    ...index,
    classification,
    summary: `${tierLabel} ${classification.kindLabel} 직업입니다. ${statSummary}과 전용 스킬 ${skills.length}개를 확인할 수 있습니다.`,
    unlockText: jobUnlockConditionText(job),
    prerequisites: prerequisiteRelations(job),
    additionalUnlockConditions: [
      ...(job.unlock.extraConditions ?? [])
        .map(additionalConditionText)
        .filter((text): text is string => text != null),
      ...tier7UnlockConditions(job.id),
    ],
    nextJobs: nextJobRelations(job.id),
    jobBonuses: statValues(job.jobBonus),
    cultivation: statValues(job.cultivateProfile),
    skills,
    guide: jobManualGuideFor(job.id),
  };
}

export function jobManualStaticParams(): Array<{ jobId: string }> {
  return V2_JOB_LIST.map((job) => ({ jobId: job.id }));
}
