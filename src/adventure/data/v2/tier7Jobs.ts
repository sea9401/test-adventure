export const TIER7_COMBAT_JOB_IDS = [
  "shadowblade",
  "ruinblade",
  "skyascendant",
  "primordialsage",
  "dreadnought",
  "paragon",
] as const;

export type Tier7CombatJobId = (typeof TIER7_COMBAT_JOB_IDS)[number];

export const TIER7_COMBAT_JOB_NAMES: Record<Tier7CombatJobId, string> = {
  shadowblade: "무영검신",
  ruinblade: "멸검제",
  skyascendant: "비천무신",
  primordialsage: "태초현자",
  dreadnought: "드레드노트",
  paragon: "파라곤",
};

export const TIER7_COMBAT_JOB_PREREQS: Record<
  Tier7CombatJobId,
  readonly [string, string]
> = {
  shadowblade: ["swordsaint", "blackmoon"],
  ruinblade: ["swordsaint", "hegemon"],
  skyascendant: ["heavenlybow", "celestialdragon"],
  primordialsage: ["archmage", "primordialmage"],
  dreadnought: ["fortressknight", "vajraarhat"],
  paragon: ["grandchampion", "absolute"],
};

export function isTier7CombatJobId(value: string): value is Tier7CombatJobId {
  return (TIER7_COMBAT_JOB_IDS as readonly string[]).includes(value);
}
