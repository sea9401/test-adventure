import {
  spCostOf,
  V2_SKILLS,
  type V2SkillId,
} from "@/adventure/data/v2/v2Skills";

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
  const rows = skills.map<LoadoutPresetDiagnosisRow>((skillId) => {
    const learned = learnedById.get(skillId);
    if (learned) {
      return {
        skillId,
        name: learned.name,
        spCost: Math.max(0, Math.floor(Number(learned.spCost) || 0)),
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
  const spUsed = rows.reduce((sum, row) => sum + row.spCost, 0);
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
  const keptRows = diagnosis.rows.filter((row) => row.status === "learned");
  const removed = diagnosis.rows
    .filter((row) => row.status !== "learned")
    .map((row) => row.skillId);
  let spUsed = keptRows.reduce((sum, row) => sum + row.spCost, 0);

  while (spUsed > diagnosis.spBudget && keptRows.length > 0) {
    const row = keptRows.pop();
    if (!row) break;
    spUsed -= row.spCost;
    removed.push(row.skillId);
  }

  return {
    skills: keptRows.map((row) => row.skillId),
    removed,
    spUsed,
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
