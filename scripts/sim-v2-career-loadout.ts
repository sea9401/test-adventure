import { calcSpBudget } from "../src/adventure/data/v2/coreLoopConfig";
import {
  V2_JOB_CATALOG,
  jobUnlockSpBonus,
} from "../src/adventure/data/v2/v2JobCatalog";
import {
  emptyProficiency,
  type V2ProficiencyState,
} from "../src/adventure/data/v2/proficiency";
import {
  V2_SKILLS,
  spCostOf,
  type V2SkillId,
  type V2SkillsState,
} from "../src/adventure/data/v2/v2Skills";
import { skillsForJob } from "../src/adventure/data/v2/v2SkillsByJob";
import type { V2StatKey } from "../src/adventure/data/v2/v2StatKeys";

export type SimArch = "STR" | "DEX" | "VIT" | "INT" | "SPI" | "LUK" | "BAL";

/**
 * 원정 성장 스냅샷용 6차 순회 순서.
 * 같은 주력 스탯만 겹치지 않고 공격·생존·유틸 패시브가 섞이도록 구성한다.
 * 생활 6차는 전투 패시브 조합 비교에서 제외한다.
 */
export const TIER6_CAREER_ROUTES: Record<SimArch, readonly string[]> = {
  STR: ["swordsaint", "hegemon", "celestialdragon"],
  DEX: ["heavenlybow", "blackmoon", "celestialdragon"],
  VIT: ["fortressknight", "vajraarhat", "eternal"],
  INT: ["archmage", "primordialmage", "doomprophet"],
  SPI: ["savior", "vajraarhat", "eternal"],
  LUK: ["blackmoon", "myriadvenom", "heavenlybow"],
  BAL: ["absolute", "celestialdragon", "primordialmage"],
};

export type CareerSnapshot = {
  tier6Count: number;
  tier6Jobs: string[];
  visitedJobs: string[];
  currentJob: string;
  learnedJobSkills: V2SkillId[];
  spBudget: number;
};

function directParent(jobId: string): string | null {
  const job = V2_JOB_CATALOG[jobId];
  if (!job) return null;
  return Object.keys(job.unlock.prereqs)[0] ??
    job.unlock.extraConditions?.find((condition) => condition.type === "jobUnlocked")?.jobId ??
    null;
}

function collectLineage(jobId: string, out: string[], seen: Set<string>): void {
  if (seen.has(jobId)) return;
  const job = V2_JOB_CATALOG[jobId];
  if (!job) return;
  seen.add(jobId);
  for (const parentId of Object.keys(job.unlock.prereqs)) {
    collectLineage(parentId, out, seen);
  }
  for (const condition of job.unlock.extraConditions ?? []) {
    if (condition.type === "jobUnlocked") collectLineage(condition.jobId, out, seen);
  }
  out.push(jobId);
}

function proficiencyForTargets(targets: readonly string[]): V2ProficiencyState {
  const proficiency = emptyProficiency();
  const visit = (jobId: string, seen: Set<string>) => {
    if (seen.has(jobId)) return;
    seen.add(jobId);
    const job = V2_JOB_CATALOG[jobId];
    if (!job) return;
    for (const [parentId, required] of Object.entries(job.unlock.prereqs)) {
      const parent = V2_JOB_CATALOG[parentId];
      const need = Math.max(0, Math.floor(required ?? 0));
      if ((parent?.tier ?? 1) <= 1) {
        const group = proficiency.groups[parentId] ?? {
          level: 1,
          exp: 0,
          tier: 1,
          cumLevel: 0,
        };
        proficiency.groups[parentId] = {
          ...group,
          cumLevel: Math.max(group.cumLevel ?? 0, need),
        };
      } else {
        proficiency.jobCumLevel ??= {};
        proficiency.jobCumLevel[parentId] = Math.max(
          proficiency.jobCumLevel[parentId] ?? 0,
          need,
        );
      }
      visit(parentId, seen);
    }
    for (const condition of job.unlock.extraConditions ?? []) {
      if (condition.type === "jobUnlocked") visit(condition.jobId, seen);
    }
  };
  const seen = new Set<string>();
  for (const target of targets) visit(target, seen);
  return proficiency;
}

export function buildCareerSnapshot(
  arch: SimArch,
  requestedTier6Count: number,
): CareerSnapshot {
  const route = TIER6_CAREER_ROUTES[arch];
  const tier6Count = Math.max(0, Math.min(route.length, Math.floor(requestedTier6Count)));
  const tier6Jobs = route.slice(0, tier6Count);
  const firstParent = directParent(route[0]);
  if (!firstParent) throw new Error(`6차 기준 직업의 5차 선행 직업이 없습니다: ${route[0]}`);
  const targets = tier6Count > 0 ? tier6Jobs : [firstParent];
  const visitedJobs: string[] = [];
  const seen = new Set<string>();
  for (const target of targets) collectLineage(target, visitedJobs, seen);
  const currentJob = targets.at(-1) ?? firstParent;
  const learnedJobSkills = Array.from(
    new Set(visitedJobs.flatMap((jobId) => skillsForJob(jobId))),
  );
  const proficiency = proficiencyForTargets(targets);
  const spBudget = calcSpBudget(
    proficiency.groups,
    0,
    0,
    jobUnlockSpBonus(proficiency),
  );
  return {
    tier6Count,
    tier6Jobs: [...tier6Jobs],
    visitedJobs,
    currentJob,
    learnedJobSkills,
    spBudget,
  };
}

const MAIN_STAT: Record<SimArch, V2StatKey | null> = {
  STR: "str",
  DEX: "dex",
  VIT: "vit",
  INT: "int",
  SPI: "spi",
  LUK: "luk",
  BAL: null,
};

function statAffinity(arch: SimArch, stat: V2StatKey): number {
  const main = MAIN_STAT[arch];
  if (main == null) return 1.7;
  if (stat === main) return 4;
  if (arch === "STR" && (stat === "dex" || stat === "vit")) return 1.6;
  if (arch === "DEX" && stat === "luk") return 2.4;
  if (arch === "VIT" && (stat === "str" || stat === "spi")) return 2;
  if (arch === "INT" && stat === "spi") return 2.2;
  if (arch === "SPI" && (stat === "vit" || stat === "int")) return 2.4;
  if (arch === "LUK" && stat === "dex") return 2.6;
  return 0.5;
}

function passiveScore(arch: SimArch, id: V2SkillId): number {
  const passive = V2_SKILLS[id]?.passive;
  if (!passive) return 0;
  let score = 0;
  for (const [stat, value] of Object.entries(passive.stat ?? {})) {
    score += (value ?? 0) * statAffinity(arch, stat as V2StatKey) * 0.5;
  }
  for (const [stat, value] of Object.entries(passive.statPct ?? {})) {
    score += (value ?? 0) * statAffinity(arch, stat as V2StatKey);
  }
  const sustain = arch === "VIT" || arch === "SPI" ? 1.8 : 0.8;
  const magic = arch === "INT" || arch === "SPI" ? 1.5 : 0.25;
  const physical = arch === "STR" || arch === "DEX" || arch === "LUK" ? 1.3 : 0.6;
  score += (passive.maxHpPct ?? 0) * sustain;
  score += (passive.maxMpPct ?? 0) * magic;
  score += (passive.atkPerDexCoef ?? 0) * (arch === "DEX" || arch === "LUK" ? 140 : 20);
  score += (passive.critPct ?? 0) * physical;
  score += (passive.critDmgPct ?? 0) * physical * 0.7;
  score += (passive.evasionPct ?? 0) * (arch === "DEX" || arch === "LUK" ? 1.2 : 0.65);
  score += (passive.lifestealPct ?? 0) * sustain * 1.5;
  score += (passive.counterChancePct ?? 0) * (arch === "VIT" ? 1.5 : 0.35);
  score += (passive.defPct ?? 0) * sustain;
  score += (passive.thornsDefPct ?? 0) * (arch === "VIT" ? 0.7 : 0.12);
  score += (passive.accuracyPct ?? 0) * physical * 0.5;
  score += (passive.healPowerPct ?? 0) * (arch === "SPI" ? 1.8 : 0.4);
  score += (passive.damageTakenReductionPct ?? 0) * sustain * 2;
  score += (passive.magicDefPct ?? 0) * sustain;
  score +=
    (passive.openingMagicDamageReductionPct ?? 0) *
    sustain *
    0.5 *
    Math.sqrt((passive.openingMagicDamageReductionPhases ?? 3) / 3);
  score += (passive.poisonedEnemyDefReductionPct ?? 0) * (arch === "LUK" ? 1.4 : 0.2);
  score += (passive.berserkAtkPctPerLostHpPct ?? 0) * (arch === "STR" ? 40 : 8);
  score +=
    (passive.enemyMagicVulnPctPerStack ?? 0) *
    magic *
    2 *
    ((passive.enemyMagicVulnApplyChancePct ?? 100) / 100);
  score += (passive.magicSkillDamagePct ?? 0) * magic * 1.5;
  score +=
    (passive.singleHitPhysicalSkillDamagePct ?? 0) * physical * 1.2;
  score += (passive.spdToAtkMaxPct ?? 0) * physical;
  score +=
    (passive.atkPerLukCoef ?? 0) *
    (arch === "LUK" ? 95 : arch === "DEX" ? 35 : 8);
  score +=
    (passive.spdPerLukCoef ?? 0) *
    (arch === "LUK" ? 60 : arch === "DEX" ? 20 : 5);
  if (passive.skillCritOverflow) score += arch === "DEX" || arch === "LUK" ? 35 : 8;
  if (passive.skillCritAfterEvade) score += arch === "DEX" || arch === "LUK" ? 30 : 6;
  if (passive.counterDamageUsesReflectBoost) score += arch === "VIT" ? 28 : 5;
  score += (passive.comboFinisherBonusPct ?? 0) * (arch === "STR" || arch === "DEX" ? 1.1 : 0.3);
  return score * (1 + Math.max(0, V2_SKILLS[id].tier - 1) * 0.04);
}

function activeScore(arch: SimArch, id: V2SkillId): number {
  const skill = V2_SKILLS[id];
  if (!skill || skill.passive || skill.category === "passive") return 0;
  let score = skill.tier * 10;
  if (skill.category === "attack") score += 45;
  else if (skill.category === "heal") score += arch === "SPI" || arch === "VIT" ? 38 : 16;
  else if (skill.category === "buff") score += 25;
  for (const rawEffect of skill.effects) {
    const effect = rawEffect as {
      kind: string;
      scaling?: string;
      pierceDamagePct?: number;
    };
    if (
      effect.kind === "damage" ||
      effect.kind === "hpCostDamage" ||
      effect.kind === "executeDamage" ||
      effect.kind === "ambushDamage" ||
      effect.kind === "stackPayoffDamage" ||
      effect.kind === "healToDamage"
    ) {
      score += 12;
      const scaling = effect.scaling;
      if (scaling === "all" || scaling === MAIN_STAT[arch]) score += 24;
      if (arch === "INT" && scaling === "magic") score += 24;
      if (arch === "SPI" && (scaling === "spi" || scaling === "magic")) score += 24;
      if (arch === "VIT" && (scaling === "def" || scaling === "maxHp")) score += 24;
      if ((arch === "STR" || arch === "DEX" || arch === "LUK") && scaling === "atk") score += 16;
      score += (effect.pierceDamagePct ?? 0) * 0.3;
    }
    if (effect.kind === "heal" || effect.kind === "shield" || effect.kind === "selfRegen") {
      score += arch === "VIT" || arch === "SPI" ? 20 : 7;
    }
    if (effect.kind.startsWith("enemy") || effect.kind.startsWith("selfBuff")) score += 7;
  }
  return score;
}

export function selectCareerLoadout(
  arch: SimArch,
  learnedInput: readonly V2SkillId[],
  spBudget: number,
): V2SkillsState & { spUsed: number } {
  const learned = Array.from(new Set(learnedInput)).filter((id) => V2_SKILLS[id] != null);
  const equipped: V2SkillId[] = [];
  let spUsed = 0;
  const add = (id: V2SkillId) => {
    if (equipped.includes(id)) return false;
    const cost = spCostOf(V2_SKILLS[id]);
    if (spUsed + cost > spBudget) return false;
    equipped.push(id);
    spUsed += cost;
    return true;
  };

  const actives = learned
    .filter((id) => !V2_SKILLS[id].passive && V2_SKILLS[id].category !== "passive")
    .sort((a, b) => activeScore(arch, b) - activeScore(arch, a));
  const primaryAttack = actives.find((id) => V2_SKILLS[id].category === "attack");
  if (primaryAttack) add(primaryAttack);

  const passives = learned
    .filter((id) => passiveScore(arch, id) > 0)
    .sort((a, b) => {
      const aCost = Math.max(1, spCostOf(V2_SKILLS[a]));
      const bCost = Math.max(1, spCostOf(V2_SKILLS[b]));
      return passiveScore(arch, b) / bCost - passiveScore(arch, a) / aCost;
    });
  for (const id of passives) add(id);

  for (const id of actives) add(id);
  return { learned, equipped, spUsed };
}
