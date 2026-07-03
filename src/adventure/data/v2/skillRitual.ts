import type {
  V2SkillDefinition,
  V2SkillEffect,
  V2SkillId,
} from "./v2Skills";

export type SkillRitualMode = "power" | "focus";
export type V2SkillEnhancement = {
  mode: SkillRitualMode;
  level: number;
};
export type V2SkillEnhancements = Partial<Record<V2SkillId, V2SkillEnhancement>>;

export type SkillRitualStep = {
  level: 1 | 2 | 3 | 4 | 5;
  goldCost: number;
  proficiencyCost: number;
  requiredJobCumLevel: number;
  powerBonusPct: number;
  focusBonusPct: number;
};

export const SKILL_RITUAL_MAX_LEVEL = 5;

export const SKILL_RITUAL_STEPS: readonly SkillRitualStep[] = [
  {
    level: 1,
    goldCost: 1_000_000,
    proficiencyCost: 300,
    requiredJobCumLevel: 0,
    powerBonusPct: 2,
    focusBonusPct: 2,
  },
  {
    level: 2,
    goldCost: 3_000_000,
    proficiencyCost: 800,
    requiredJobCumLevel: 150,
    powerBonusPct: 5,
    focusBonusPct: 4,
  },
  {
    level: 3,
    goldCost: 8_000_000,
    proficiencyCost: 1_800,
    requiredJobCumLevel: 300,
    powerBonusPct: 9,
    focusBonusPct: 6,
  },
  {
    level: 4,
    goldCost: 20_000_000,
    proficiencyCost: 4_000,
    requiredJobCumLevel: 500,
    powerBonusPct: 14,
    focusBonusPct: 8,
  },
  {
    level: 5,
    goldCost: 50_000_000,
    proficiencyCost: 9_000,
    requiredJobCumLevel: 800,
    powerBonusPct: 20,
    focusBonusPct: 10,
  },
] as const;

export function skillRitualStepForLevel(level: number): SkillRitualStep | null {
  return SKILL_RITUAL_STEPS.find((step) => step.level === level) ?? null;
}

export function skillRitualBonusPct(level: number): number {
  return skillRitualPowerBonusPct(level);
}

export function skillRitualPowerBonusPct(level: number): number {
  if (level <= 0) return 0;
  return skillRitualStepForLevel(Math.min(SKILL_RITUAL_MAX_LEVEL, Math.floor(level)))
    ?.powerBonusPct ?? 0;
}

export function skillRitualFocusBonusPct(level: number): number {
  if (level <= 0) return 0;
  return skillRitualStepForLevel(Math.min(SKILL_RITUAL_MAX_LEVEL, Math.floor(level)))
    ?.focusBonusPct ?? 0;
}

export function skillRitualPowerMultiplier(level: number): number {
  return 1 + skillRitualPowerBonusPct(level) / 100;
}

export function skillRitualState(
  enhancements: V2SkillEnhancements | undefined,
  skillId: V2SkillId,
): V2SkillEnhancement | null {
  return enhancements?.[skillId] ?? null;
}

export function skillRitualLevel(
  enhancements: V2SkillEnhancements | undefined,
  skillId: V2SkillId,
): number {
  return skillRitualState(enhancements, skillId)?.level ?? 0;
}

export function skillRitualMode(
  enhancements: V2SkillEnhancements | undefined,
  skillId: V2SkillId,
): SkillRitualMode | null {
  return skillRitualState(enhancements, skillId)?.mode ?? null;
}

export function skillRitualPowerBonusFor(
  enhancements: V2SkillEnhancements | undefined,
  skillId: V2SkillId,
): number {
  const state = skillRitualState(enhancements, skillId);
  return state?.mode === "power" ? skillRitualPowerBonusPct(state.level) : 0;
}

export function skillRitualFocusBonusFor(
  enhancements: V2SkillEnhancements | undefined,
  skillId: V2SkillId,
): number {
  const state = skillRitualState(enhancements, skillId);
  return state?.mode === "focus" ? skillRitualFocusBonusPct(state.level) : 0;
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

export function isSkillRitualPowerEligible(skill: V2SkillDefinition): boolean {
  if (skill.monsterOnly || skill.category === "passive") return false;
  const baseEffects = skill.effects.some(isPowerEffect);
  const elementEffects =
    skill.elementEffects != null &&
    Object.values(skill.elementEffects).some((effects) =>
      effects?.some(isPowerEffect),
    );
  return baseEffects || elementEffects;
}

export function isSkillRitualFocusEligible(skill: V2SkillDefinition): boolean {
  if (skill.monsterOnly || skill.category === "passive") return false;
  return (
    typeof skill.procChance === "number" &&
    Number.isFinite(skill.procChance) &&
    skill.procChance > 0 &&
    skill.procChance < 100
  );
}

export function isSkillRitualEligible(skill: V2SkillDefinition): boolean {
  return isSkillRitualPowerEligible(skill) || isSkillRitualFocusEligible(skill);
}

export function skillRitualRefund(level: number): {
  gold: number;
  proficiency: number;
} {
  const maxLevel = Math.max(0, Math.min(SKILL_RITUAL_MAX_LEVEL, Math.floor(level)));
  let gold = 0;
  let proficiency = 0;
  for (const step of SKILL_RITUAL_STEPS) {
    if (step.level > maxLevel) break;
    gold += step.goldCost;
    proficiency += step.proficiencyCost;
  }
  return {
    gold: Math.floor(gold * 0.5),
    proficiency: Math.floor(proficiency * 0.5),
  };
}

export function normalizeSkillEnhancements(
  raw: unknown,
  learned: readonly V2SkillId[],
): V2SkillEnhancements {
  if (!raw || typeof raw !== "object") return {};
  const learnedSet = new Set<string>(learned);
  const out: V2SkillEnhancements = {};
  for (const [id, entryRaw] of Object.entries(raw as Record<string, unknown>)) {
    if (!learnedSet.has(id)) continue;
    let mode: SkillRitualMode = "power";
    let levelRaw: unknown = entryRaw;
    if (entryRaw && typeof entryRaw === "object" && !Array.isArray(entryRaw)) {
      const entry = entryRaw as { mode?: unknown; level?: unknown };
      mode = entry.mode === "focus" ? "focus" : "power";
      levelRaw = entry.level;
    }
    if (typeof levelRaw !== "number" || !Number.isFinite(levelRaw)) continue;
    const level = Math.max(0, Math.min(SKILL_RITUAL_MAX_LEVEL, Math.floor(levelRaw)));
    if (level > 0) out[id as V2SkillId] = { mode, level };
  }
  return out;
}
