import type {
  V2SkillDefinition,
  V2SkillEffect,
  V2SkillId,
} from "./v2Skills";

export type V2SkillEnhancements = Partial<Record<V2SkillId, number>>;

export type SkillRitualStep = {
  level: 1 | 2 | 3 | 4 | 5;
  goldCost: number;
  proficiencyCost: number;
  requiredJobCumLevel: number;
  bonusPct: number;
};

export const SKILL_RITUAL_MAX_LEVEL = 5;

export const SKILL_RITUAL_STEPS: readonly SkillRitualStep[] = [
  {
    level: 1,
    goldCost: 1_000_000,
    proficiencyCost: 300,
    requiredJobCumLevel: 0,
    bonusPct: 2,
  },
  {
    level: 2,
    goldCost: 3_000_000,
    proficiencyCost: 800,
    requiredJobCumLevel: 150,
    bonusPct: 5,
  },
  {
    level: 3,
    goldCost: 8_000_000,
    proficiencyCost: 1_800,
    requiredJobCumLevel: 300,
    bonusPct: 9,
  },
  {
    level: 4,
    goldCost: 20_000_000,
    proficiencyCost: 4_000,
    requiredJobCumLevel: 500,
    bonusPct: 14,
  },
  {
    level: 5,
    goldCost: 50_000_000,
    proficiencyCost: 9_000,
    requiredJobCumLevel: 800,
    bonusPct: 20,
  },
] as const;

export function skillRitualStepForLevel(level: number): SkillRitualStep | null {
  return SKILL_RITUAL_STEPS.find((step) => step.level === level) ?? null;
}

export function skillRitualBonusPct(level: number): number {
  if (level <= 0) return 0;
  return skillRitualStepForLevel(Math.min(SKILL_RITUAL_MAX_LEVEL, Math.floor(level)))
    ?.bonusPct ?? 0;
}

export function skillRitualPowerMultiplier(level: number): number {
  return 1 + skillRitualBonusPct(level) / 100;
}

export function skillRitualLevel(
  enhancements: V2SkillEnhancements | undefined,
  skillId: V2SkillId,
): number {
  const raw = enhancements?.[skillId];
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(SKILL_RITUAL_MAX_LEVEL, Math.floor(raw)));
}

export function nextSkillRitualStep(currentLevel: number): SkillRitualStep | null {
  return skillRitualStepForLevel(currentLevel + 1);
}

function isPowerEffect(effect: V2SkillEffect): boolean {
  return (
    effect.kind === "damage" ||
    effect.kind === "heal" ||
    effect.kind === "shield" ||
    effect.kind === "hpCostDamage" ||
    effect.kind === "healToDamage" ||
    effect.kind === "executeDamage" ||
    effect.kind === "ambushDamage" ||
    effect.kind === "stackPayoffDamage"
  );
}

export function isSkillRitualEligible(skill: V2SkillDefinition): boolean {
  if (skill.monsterOnly || skill.category === "passive") return false;
  const baseEffects = skill.effects.some(isPowerEffect);
  const elementEffects =
    skill.elementEffects != null &&
    Object.values(skill.elementEffects).some((effects) =>
      effects?.some(isPowerEffect),
    );
  return baseEffects || elementEffects;
}

export function normalizeSkillEnhancements(
  raw: unknown,
  learned: readonly V2SkillId[],
): V2SkillEnhancements {
  if (!raw || typeof raw !== "object") return {};
  const learnedSet = new Set<string>(learned);
  const out: V2SkillEnhancements = {};
  for (const [id, levelRaw] of Object.entries(raw as Record<string, unknown>)) {
    if (!learnedSet.has(id)) continue;
    if (typeof levelRaw !== "number" || !Number.isFinite(levelRaw)) continue;
    const level = Math.max(0, Math.min(SKILL_RITUAL_MAX_LEVEL, Math.floor(levelRaw)));
    if (level > 0) out[id as V2SkillId] = level;
  }
  return out;
}
