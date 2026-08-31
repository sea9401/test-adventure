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
import {
  guildDiningMenu,
  parseGuildDiningUserState,
  type GuildDiningEffectSummary,
} from "@/adventure/data/v2/guildDining";

type StateCharSave = {
  class?: unknown;
  specChoice?: unknown;
  level?: unknown;
};

export type StateView = "full" | "core";

export function guildDiningEffectSummary(
  raw: unknown,
  args: { weekKey: string; guildId: number; now: Date },
): GuildDiningEffectSummary | null {
  const activeEffect = parseGuildDiningUserState(raw, args).activeEffect;
  if (!activeEffect) return null;
  const menu = guildDiningMenu(activeEffect.menuId);
  if (!menu) return null;
  return {
    menuId: activeEffect.menuId,
    name: menu.name,
    kind: activeEffect.kind,
    bonusPct: activeEffect.bonusPct,
    ...(activeEffect.lifeBonusPct == null
      ? {}
      : { lifeBonusPct: activeEffect.lifeBonusPct }),
    expiresAt: activeEffect.expiresAt,
  };
}

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
