import { parseV2Class, tier1ClassOf } from "@/adventure/data/v2/classes";
import {
  addStatFloorLevels,
  parseProficiencyForChar,
  setGrown,
  type V2ProficiencyState,
} from "@/adventure/data/v2/proficiency";
import {
  lifeResourceRangesForProficiency,
  rollLevelGrowth,
} from "@/adventure/data/v2/statGrowth";
import { jobIdFromLegacy } from "@/adventure/data/v2/v2JobCatalog";
import { MAX_LEVEL } from "@/lib/leveling";
import { rollLifeResourceLevels } from "@/adventure/data/v2/lifeResourceGrowth";
import { V2_STAT_KEYS } from "@/adventure/data/v2/v2StatKeys";
import { v2LevelGrowthHpMp } from "./derivePlayerCombatV2";

export type LevelTargetGrantResult = {
  level: number;
  exp: number;
  levelsGained: number;
  proficiency: V2ProficiencyState;
  hpGain: number;
  mpGain: number;
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
  proficiency = addStatFloorLevels(
    proficiency,
    tier1ClassOf(playerClass),
    levelsGained,
  );
  const grownBefore = proficiency.grown;
  let grown = grownBefore;
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
  let hpGain = 0;
  let mpGain = 0;
  if (levelsGained > 0 && proficiency.lifeResourceGrowth) {
    const rolled = rollLifeResourceLevels(
      proficiency.lifeResourceGrowth,
      currentLevel,
      levelsGained,
      lifeResourceRangesForProficiency(proficiency),
      rand,
    );
    proficiency = { ...proficiency, lifeResourceGrowth: rolled.record };
    hpGain = rolled.hpGain;
    mpGain = rolled.mpGain;
  } else if (levelsGained > 0) {
    const statGains = Object.fromEntries(
      V2_STAT_KEYS.map((stat) => [
        stat,
        Math.max(0, (grown[stat] ?? 0) - (grownBefore[stat] ?? 0)),
      ]),
    ) as Record<(typeof V2_STAT_KEYS)[number], number>;
    const legacy = v2LevelGrowthHpMp({
      levelsGained,
      strGained: statGains.str,
      vitGained: statGains.vit,
      intGained: statGains.int,
    });
    hpGain = legacy.hp;
    mpGain = legacy.mp;
  }

  return {
    level,
    exp: level >= normalizedTarget ? 0 : Math.max(0, Number(charSave.exp) || 0),
    levelsGained,
    proficiency,
    hpGain,
    mpGain,
  };
}
