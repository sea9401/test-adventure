import {
  spCostOf,
  V2_SKILLS,
  type V2SkillId,
} from "@/adventure/data/v2/v2Skills";
import { resolveElementalResonanceLoadout } from "@/adventure/data/v2/elementalResonance";

export type LoadoutPresetSkillMeta = {
  skillId: string;
  name: string;
  spCost: number;
};

export type LoadoutPresetSkillStatus = "learned" | "notLearned" | "unknown";

export type LoadoutPresetDiagnosisRow = {
  skillId: string;
  name: string;
  spCost: number;
  effectiveSpCost?: number;
  status: LoadoutPresetSkillStatus;
};

export type LoadoutPresetDiagnosis = {
  rows: LoadoutPresetDiagnosisRow[];
  spUsed: number;
  spBudget: number;
  overBy: number;
  canApply: boolean;
};

function safeBudget(value: number): number {
  return Math.max(0, Math.floor(Number(value) || 0));
}

export function diagnoseLoadoutPreset(
  skills: readonly string[],
  library: readonly LoadoutPresetSkillMeta[],
  spBudget: number,
): LoadoutPresetDiagnosis {
  const learnedById = new Map(library.map((skill) => [skill.skillId, skill]));
  const learnedIds = library
    .map((skill) => skill.skillId as V2SkillId)
    .filter((skillId) => V2_SKILLS[skillId] !== undefined);
  const equippedIds = skills
    .filter((skillId) => learnedById.has(skillId) && V2_SKILLS[skillId as V2SkillId])
    .map((skillId) => skillId as V2SkillId);
  const resonance = resolveElementalResonanceLoadout({
    learned: learnedIds,
    equipped: equippedIds,
  });
  const rows = skills.map<LoadoutPresetDiagnosisRow>((skillId) => {
    const learned = learnedById.get(skillId);
    if (learned) {
      const baseCost = Math.max(0, Math.floor(Number(learned.spCost) || 0));
      const effectiveSpCost = resonance.effectiveSpCosts.get(skillId as V2SkillId);
      return {
        skillId,
        name: learned.name,
        spCost: baseCost,
        ...(effectiveSpCost !== undefined && effectiveSpCost !== baseCost
          ? { effectiveSpCost }
          : {}),
        status: "learned",
      };
    }

    const definition = V2_SKILLS[skillId as V2SkillId];
    if (definition) {
      return {
        skillId,
        name: definition.name,
        spCost: spCostOf(definition),
        status: "notLearned",
      };
    }

    return { skillId, name: skillId, spCost: 0, status: "unknown" };
  });
  const budget = safeBudget(spBudget);
  const spUsed = rows.reduce(
    (sum, row) => sum + (row.effectiveSpCost ?? row.spCost),
    0,
  );
  const overBy = Math.max(0, spUsed - budget);
  return {
    rows,
    spUsed,
    spBudget: budget,
    overBy,
    canApply:
      overBy === 0 && rows.every((row) => row.status === "learned"),
  };
}

export function autoFitLoadoutPreset(
  skills: readonly string[],
  library: readonly LoadoutPresetSkillMeta[],
  spBudget: number,
): {
  skills: string[];
  removed: string[];
  spUsed: number;
  spBudget: number;
} {
  const diagnosis = diagnoseLoadoutPreset(skills, library, spBudget);
  const keptSkills = diagnosis.rows
    .filter((row) => row.status === "learned")
    .map((row) => row.skillId);
  const removed = diagnosis.rows
    .filter((row) => row.status !== "learned")
    .map((row) => row.skillId);
  let fittedDiagnosis = diagnoseLoadoutPreset(keptSkills, library, diagnosis.spBudget);

  while (fittedDiagnosis.spUsed > diagnosis.spBudget && keptSkills.length > 0) {
    const skillId = keptSkills.pop();
    if (!skillId) break;
    removed.push(skillId);
    fittedDiagnosis = diagnoseLoadoutPreset(keptSkills, library, diagnosis.spBudget);
  }

  return {
    skills: keptSkills,
    removed,
    spUsed: fittedDiagnosis.spUsed,
    spBudget: diagnosis.spBudget,
  };
}

export function toggleLoadoutPresetDraftSkill(
  savedSkills: readonly string[],
  draftSkills: readonly string[],
  skillId: string,
): string[] {
  const selected = new Set(draftSkills);
  if (selected.has(skillId)) selected.delete(skillId);
  else selected.add(skillId);
  return savedSkills.filter((id) => selected.has(id));
}
