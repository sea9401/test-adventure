import type { V2PassiveSkillEffect } from "./v2Skills";

export const TEMPLAR_LINEAGE_JOB_IDS = ["templar", "crusader", "radiantknight", "dawnpaladin"] as const;

type BonusStats = Pick<V2PassiveSkillEffect, "healPowerPct" | "damageTakenReductionPct" | "defPct" | "accuracyPct" | "critDmgPct">;
export type LineagePassiveBonus = {
  label: string;
  jobIds: readonly string[];
  passive: BonusStats;
};

export function passiveForJob(base: V2PassiveSkillEffect | undefined, bonus: LineagePassiveBonus | undefined, jobId?: string): V2PassiveSkillEffect | undefined {
  if (!base || !bonus || !jobId || !bonus.jobIds.includes(jobId)) return base;
  const combined = { ...base };
  for (const key of Object.keys(bonus.passive) as (keyof BonusStats)[]) {
    combined[key] = (base[key] ?? 0) + (bonus.passive[key] ?? 0);
  }
  return combined;
}
