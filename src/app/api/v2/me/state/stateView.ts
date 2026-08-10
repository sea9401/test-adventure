import { parseV2Class, tier1ClassOf } from "@/adventure/data/v2/classes";
import {
  groupCumLevel,
  parseProficiencyForChar,
} from "@/adventure/data/v2/proficiency";
import {
  V2_JOB_CATALOG,
  cumLevelForJob,
  jobIdFromLegacy,
} from "@/adventure/data/v2/v2JobCatalog";

type StateCharSave = {
  class?: unknown;
  specChoice?: unknown;
  level?: unknown;
};

export type StateView = "full" | "core";

export function parseStateView(rawUrl: string): StateView | null {
  const value = new URL(rawUrl).searchParams.get("view");
  if (value == null || value === "" || value === "full") return "full";
  if (value === "core") return "core";
  return null;
}

export function currentJobSummary(charSave: StateCharSave) {
  const cls = parseV2Class(charSave.class);
  const specChoice =
    typeof charSave.specChoice === "string" ? charSave.specChoice : null;
  const currentJobId = jobIdFromLegacy(cls, specChoice);
  const currentJob = V2_JOB_CATALOG[currentJobId];
  return {
    currentJobId,
    currentJobName: currentJob?.name ?? "모험가",
    currentJobTier: currentJob?.tier ?? 0,
  };
}

export function proficiencySummary(
  proficiencyRaw: unknown,
  charSave: StateCharSave,
) {
  const proficiency = parseProficiencyForChar(proficiencyRaw, charSave);
  const cls = parseV2Class(charSave.class);
  const group = tier1ClassOf(cls);
  const specChoice =
    typeof charSave.specChoice === "string" ? charSave.specChoice : null;
  const currentJob = V2_JOB_CATALOG[jobIdFromLegacy(cls, specChoice)];
  const cumLevel = currentJob
    ? cumLevelForJob(proficiency, currentJob)
    : groupCumLevel(proficiency, group);

  return {
    groups:
      group === "none"
        ? {}
        : { [group]: { tier: proficiency.groups[group]?.tier ?? 1 } },
    current: { group, cumLevel },
  };
}
