import { parseV2Class } from "@/adventure/data/v2/classes";
import {
  parseProficiencyForChar,
  setGrown,
  type V2ProficiencyState,
} from "@/adventure/data/v2/proficiency";
import { rollLevelGrowth } from "@/adventure/data/v2/statGrowth";
import { jobIdFromLegacy } from "@/adventure/data/v2/v2JobCatalog";
import { MAX_LEVEL } from "@/lib/leveling";

export type LevelTargetGrantResult = {
  level: number;
  exp: number;
  levelsGained: number;
  proficiency: V2ProficiencyState;
};

export function applyLevelTargetGrant(
  charSave: {
    class?: unknown;
    level?: unknown;
    exp?: unknown;
    specChoice?: unknown;
  },
  proficiencyRaw: unknown,
  targetLevel: number,
  rand: () => number = Math.random,
): LevelTargetGrantResult {
  const currentLevel = Math.max(
    1,
    Math.min(MAX_LEVEL, Math.floor(Number(charSave.level) || 1)),
  );
  const normalizedTarget = Math.floor(Number(targetLevel));
  const level = Math.max(
    currentLevel,
    Math.min(
      MAX_LEVEL,
      Number.isFinite(normalizedTarget) ? normalizedTarget : currentLevel,
    ),
  );
  const levelsGained = level - currentLevel;

  const playerClass = parseV2Class(charSave.class);
  let proficiency = parseProficiencyForChar(proficiencyRaw, charSave);
  let grown = proficiency.grown;
  const currentJobId = jobIdFromLegacy(
    playerClass,
    typeof charSave.specChoice === "string" ? charSave.specChoice : null,
  );

  for (let index = 0; index < levelsGained; index += 1) {
    grown = rollLevelGrowth(grown, playerClass, proficiency, rand, {
      currentJobId,
    });
  }
  if (levelsGained > 0) proficiency = setGrown(proficiency, grown);

  return {
    level,
    exp: level >= normalizedTarget ? 0 : Math.max(0, Number(charSave.exp) || 0),
    levelsGained,
    proficiency,
  };
}
