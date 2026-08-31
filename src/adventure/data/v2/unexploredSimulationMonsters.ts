import type { Monster } from "@/adventure/data/monsters/types";
import { enemiesForDepth } from "./dungeon";
import { scaleMonsterForHunt } from "./monsterScale";
import {
  UNEXPLORED_MONSTER_POOLS,
  type UnexploredAbilityId,
  type UnexploredPoolId,
} from "./unexploredMonsterPools";
import { V2_MONSTERS } from "./v2Monsters";
import type { V2SkillId } from "./v2Skills";
import {
  unexploredAttackCompensation,
  unexploredHighDifficultyMultipliers,
  unexploredRawSpd,
  unexploredResourceGrowthCompensation,
  type UnexploredSimulationDifficulty,
  type UnexploredSpeedBand,
} from "./unexploredSimulationBalance";

export {
  UNEXPLORED_SIMULATION_DIFFICULTIES,
  type UnexploredSimulationDifficulty,
} from "./unexploredSimulationBalance";
export type UnexploredSimulationMode = "stats" | "mechanics";

export type UnexploredSimulationMonster = {
  kind: "base" | "special";
  difficulty: UnexploredSimulationDifficulty;
  poolId: UnexploredPoolId | null;
  monsterId: string;
  monster: Monster;
};

export type UnexploredCommonBaseline = {
  hp: number;
  atk: number;
  def: number;
  magicDef: number;
  spd: number;
  accuracy: number;
};

const STAR_GRAVE_REFERENCE_DEPTH = 84;

function uniqueSkillIds(ids: readonly (V2SkillId | null | undefined)[]): V2SkillId[] {
  return [...new Set(ids.filter((id): id is V2SkillId => id != null))];
}

function withV2Skills(
  monster: Monster,
  skillIds: readonly V2SkillId[],
  maxMp?: number,
): Monster {
  const equipped = uniqueSkillIds([
    ...(monster.v2Skills?.equipped ?? []),
    ...skillIds,
  ]);
  return {
    ...monster,
    v2Skills: { learned: equipped, equipped },
    ...(maxMp != null
      ? { v2MaxMp: Math.max(monster.v2MaxMp ?? 0, maxMp) }
      : {}),
  };
}

function brace(monster: Monster): Monster {
  return {
    ...monster,
    skill: { kind: "brace", name: "철벽 방어", damageReduction: 6 },
  };
}

function pierce(monster: Monster): Monster {
  return {
    ...monster,
    skill: { kind: "pierce", name: "정밀 관통", armorPierce: 11 },
  };
}

function heavy(monster: Monster): Monster {
  return {
    ...monster,
    skill: {
      kind: "heavy_blow",
      name: "주기적 강타",
      everyPhases: 3,
      multiplier: 2,
    },
  };
}

function enrage(monster: Monster): Monster {
  return {
    ...monster,
    skill: {
      kind: "enrage",
      name: "저체력 격노",
      hpFraction: 0.4,
      atkBonus: Math.max(1, Math.round(monster.atk * 0.2)),
    },
  };
}

function applyAbility(
  monster: Monster,
  ability: UnexploredAbilityId,
  baseline: UnexploredCommonBaseline,
): Monster {
  switch (ability) {
    case "brace":
      return brace(monster);
    case "pierce":
      return pierce(monster);
    case "heavy_every_3":
    case "periodic_heavy":
      return heavy(monster);
    case "status_resist_15":
      return { ...monster, statusDamageReductionPct: 20 };
    case "status_resist_35_brace":
      return brace({ ...monster, statusDamageReductionPct: 40 });
    case "arcane_bolt":
      return withV2Skills(
        { ...monster, atkType: "magic" },
        ["mob_arcane_bolt"],
      );
    case "heal":
    case "attack_and_heal":
      return withV2Skills(monster, ["v2_skill_recover"], 16);
    case "extra_heal_uses":
      return withV2Skills(monster, ["v2_skill_recover"], 32);
    case "low_hp_enrage":
      return enrage(monster);
    case "high_crit":
      return { ...monster, critPct: 38 };
    case "arcane_burst":
      return withV2Skills(
        { ...monster, atkType: "magic" },
        ["mob_arcane_burst"],
      );
    case "limited_arcane_nova":
      return withV2Skills(
        { ...monster, atkType: "magic" },
        ["mob_arcane_nova"],
        70,
      );
    case "high_accuracy":
      return { ...monster, accuracy: baseline.accuracy + 20 };
    case "high_accuracy_crit":
      return {
        ...monster,
        accuracy: baseline.accuracy + 30,
        critPct: 38,
      };
    case "high_accuracy_pierce":
      return pierce({ ...monster, accuracy: baseline.accuracy + 30 });
    case "fast_actions":
      return monster;
    case "bonus_attack_50":
      return { ...monster, bonusAttackChancePct: 50 };
    case "bonus_attack_low_hp_enrage":
      return enrage({ ...monster, bonusAttackChancePct: 50 });
    case "high_evasion":
      return { ...monster, evasionPct: 35 };
    case "evasion_crit":
      return { ...monster, evasionPct: 45, critPct: 38 };
    case "very_high_evasion_pierce":
      return pierce({ ...monster, evasionPct: 50 });
    case "poison_1":
      return withV2Skills(monster, ["mob_venom_bite"]);
    case "poison_2":
      return withV2Skills(monster, ["mob_catastrophe_venom"]);
    case "poison_2_survival_debuff":
      return withV2Skills(monster, ["mob_venom_sunder"]);
    case "bleed":
    case "fast_bleed":
      return withV2Skills(monster, ["mob_rending_claw"]);
    case "bleed_periodic_heavy":
      return heavy(withV2Skills(monster, ["mob_rending_claw"]));
    case "slow":
      return withV2Skills(monster, ["mob_chilling_touch"]);
    case "strong_slow_arcane":
      return withV2Skills(
        { ...monster, atkType: "magic" },
        ["mob_deep_chill", "mob_arcane_bolt"],
      );
    case "frost_limited_burst":
      return withV2Skills(
        { ...monster, atkType: "magic" },
        ["mob_glacial_chill", "mob_arcane_nova"],
        70,
      );
    case "crushing_blow":
      return withV2Skills(monster, ["mob_crushing_blow"], 60);
    default: {
      const exhaustive: never = ability;
      throw new Error(`Unsupported unexplored ability: ${String(exhaustive)}`);
    }
  }
}

function withoutSimulationRewards(monster: Monster): Monster {
  const result = { ...monster, exp: 0 };
  delete result.drops;
  delete result.image;
  return result;
}

type UnexploredBaseProfile = {
  speedBand: UnexploredSpeedBand;
  hp: number;
  atk: number;
  def: number;
  magicDef: number;
  evasionPct?: number;
  critPct?: number;
};

const UNEXPLORED_BASE_PROFILES: Record<string, UnexploredBaseProfile> = {
  "성해의 파수꾼": {
    speedBand: "slow",
    hp: 1.25,
    atk: 0.9,
    def: 1.4,
    magicDef: 0.8,
  },
  "혜성꼬리 추적자": {
    speedBand: "fast",
    hp: 0.8,
    atk: 1.05,
    def: 0.8,
    magicDef: 0.9,
    evasionPct: 30,
    critPct: 30,
  },
  "적색거성의 사제": {
    speedBand: "normal",
    hp: 0.8,
    atk: 1.15,
    def: 0.75,
    magicDef: 1.15,
  },
  "공허를 먹는 짐승": {
    speedBand: "normal",
    hp: 1.2,
    atk: 0.95,
    def: 1,
    magicDef: 1,
  },
  "죽은 별의 관측자": {
    speedBand: "normal",
    hp: 0.95,
    atk: 1,
    def: 0.8,
    magicDef: 1.35,
  },
};

function unexploredSourceProxyMonsters(
  difficulty: UnexploredSimulationDifficulty,
): UnexploredSimulationMonster[] {
  return enemiesForDepth(STAR_GRAVE_REFERENCE_DEPTH).map((entry) => {
    const base = V2_MONSTERS[entry.key];
    if (!base) {
      throw new Error(`Missing Star Grave source monster: ${entry.key}`);
    }
    const scaled = scaleMonsterForHunt(base, difficulty);
    const skillIds = uniqueSkillIds([
      ...(scaled.v2Skills?.equipped ?? []),
      entry.statusSkill,
      entry.castSkill,
    ]);
    const monster = withoutSimulationRewards({
      ...scaled,
      name: entry.name,
      ...(entry.element ? { element: entry.element } : {}),
      ...(skillIds.length > 0
        ? { v2Skills: { learned: skillIds, equipped: skillIds } }
        : {}),
    });
    return {
      kind: "base" as const,
      difficulty,
      poolId: null,
      monsterId: entry.name,
      monster,
    };
  });
}

export function unexploredBaseProxyMonsters(
  difficulty: UnexploredSimulationDifficulty,
): UnexploredSimulationMonster[] {
  const baseline = unexploredCommonBaseline(difficulty);
  const highDifficulty = unexploredHighDifficultyMultipliers(difficulty);
  const resourceGrowth = unexploredResourceGrowthCompensation(difficulty);
  return unexploredSourceProxyMonsters(difficulty).map((entry) => {
    const profile = UNEXPLORED_BASE_PROFILES[entry.monsterId];
    if (!profile) {
      throw new Error(`Missing unexplored base profile: ${entry.monsterId}`);
    }
    return {
      ...entry,
      monster: {
        ...entry.monster,
        hp: Math.max(
          1,
          Math.round(
            baseline.hp *
              profile.hp *
              highDifficulty.hp *
              resourceGrowth.hp,
          ),
        ),
        atk: Math.max(
          1,
          Math.round(
            baseline.atk *
              profile.atk *
              unexploredAttackCompensation(difficulty, profile.speedBand) *
              highDifficulty.atk *
              resourceGrowth.atk,
          ),
        ),
        def: Math.max(
          0,
          Math.round(
            baseline.def *
              profile.def *
              highDifficulty.def *
              resourceGrowth.def,
          ),
        ),
        magicDef: Math.max(
          0,
          Math.round(
            baseline.magicDef *
              profile.magicDef *
              highDifficulty.def *
              resourceGrowth.def,
          ),
        ),
        spd: unexploredRawSpd(difficulty, profile.speedBand),
        ...(profile.evasionPct != null
          ? { evasionPct: profile.evasionPct }
          : {}),
        ...(profile.critPct != null ? { critPct: profile.critPct } : {}),
      },
    };
  });
}

function median(values: readonly number[]): number {
  if (values.length === 0) throw new Error("Cannot take median of no values");
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function unexploredCommonBaseline(
  difficulty: UnexploredSimulationDifficulty,
): UnexploredCommonBaseline {
  const monsters = unexploredSourceProxyMonsters(difficulty).map(
    (entry) => entry.monster,
  );
  return {
    hp: median(monsters.map((monster) => monster.hp)),
    atk: median(monsters.map((monster) => monster.atk)),
    def: median(monsters.map((monster) => monster.def)),
    magicDef: median(
      monsters.map((monster) => monster.magicDef ?? monster.def),
    ),
    spd: median(monsters.map((monster) => monster.spd)),
    accuracy: median(monsters.map((monster) => monster.accuracy ?? 0)),
  };
}

export function unexploredSpecialMonsters(
  difficulty: UnexploredSimulationDifficulty,
  mode: UnexploredSimulationMode,
): UnexploredSimulationMonster[] {
  const baseline = unexploredCommonBaseline(difficulty);
  const highDifficulty = unexploredHighDifficultyMultipliers(difficulty);
  const resourceGrowth = unexploredResourceGrowthCompensation(difficulty);
  return UNEXPLORED_MONSTER_POOLS.flatMap((pool) =>
    pool.monsters.map((definition) => {
      const statsOnly: Monster = {
        name: definition.name,
        tags: [...definition.tags],
        hp: Math.max(
          1,
          Math.round(
            baseline.hp *
              definition.stats.hp *
              highDifficulty.hp *
              resourceGrowth.hp,
          ),
        ),
        atk: Math.max(
          1,
          Math.round(
            baseline.atk *
              definition.stats.atk *
              unexploredAttackCompensation(
                difficulty,
                definition.speedBand,
              ) *
              highDifficulty.atk *
              resourceGrowth.atk,
          ),
        ),
        def: Math.max(
          0,
          Math.round(
            baseline.def *
              definition.stats.def *
              highDifficulty.def *
              resourceGrowth.def,
          ),
        ),
        magicDef: Math.max(
          0,
          Math.round(
            baseline.magicDef *
              definition.stats.magicDef *
              highDifficulty.def *
              resourceGrowth.def,
          ),
        ),
        spd: unexploredRawSpd(difficulty, definition.speedBand),
        accuracy: baseline.accuracy,
        exp: 0,
      };
      const monster =
        mode === "mechanics"
          ? definition.abilities.reduce(
              (current, ability) => applyAbility(current, ability, baseline),
              statsOnly,
            )
          : statsOnly;
      return {
        kind: "special" as const,
        difficulty,
        poolId: pool.id,
        monsterId: definition.id,
        monster,
      };
    }),
  );
}

export function unexploredSimulationMonsters(
  difficulty: UnexploredSimulationDifficulty,
  mode: UnexploredSimulationMode,
): UnexploredSimulationMonster[] {
  return [
    ...unexploredBaseProxyMonsters(difficulty),
    ...unexploredSpecialMonsters(difficulty, mode),
  ];
}
