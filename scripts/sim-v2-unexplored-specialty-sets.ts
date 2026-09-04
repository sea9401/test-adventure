import { pathToFileURL } from "node:url";
import type { Monster } from "../src/adventure/data/monsters/types";
import {
  V2_EQUIPMENT,
  type V2EquipOptions,
  type V2EquipmentId,
  type V2EquipSlot,
} from "../src/adventure/data/v2/v2Equipment";
import { resolveBattleAtb } from "../src/adventure/v2/combat/engine.atb";
import { resolveBattlePvPAtb } from "../src/adventure/v2/combat/engine.pvp-atb";
import { pickAutoAction } from "../src/adventure/v2/combat/pickAutoAction";
import {
  buildLevelDesignProgressionSnapshot,
  type LevelDesignArchetype,
} from "./sim-v2-level-design";

export type UnexploredSpecialtySetId =
  | "tracking"
  | "toxic_blood"
  | "glacial_guard"
  | "deep_arcane";

export type SpecialtyLoadoutKey =
  | "storm"
  | "stormTransition"
  | "pioneer"
  | "pioneerTransition"
  | "bossReference";

export type SpecialtyEquipmentLoadout = Record<V2EquipSlot, V2EquipmentId>;

type SpecialtyLoadoutDefinition = {
  arch: Extract<LevelDesignArchetype, "DEX" | "LUK" | "VIT" | "INT">;
  specialtyLabels: readonly [string, string];
  storm: SpecialtyEquipmentLoadout;
  stormTransition: SpecialtyEquipmentLoadout;
  pioneer: SpecialtyEquipmentLoadout;
  pioneerTransition: SpecialtyEquipmentLoadout;
  bossReference?: SpecialtyEquipmentLoadout;
};

const TRACKING_SPECIALTY = {
  gloves: "v2_unexplored_overheat_tracking_gloves",
  boots: "v2_unexplored_shadow_leap_boots",
  ring: "v2_unexplored_orbit_calculation_ring",
} as const;

const TOXIC_BLOOD_SPECIALTY = {
  armor: "v2_unexplored_toxic_blood_erosion_armor",
  gloves: "v2_unexplored_coagulated_gauntlets",
  ring: "v2_unexplored_lord_pulse_ring",
} as const;

const GLACIAL_GUARD_SPECIALTY = {
  armor: "v2_unexplored_colossus_wall_armor",
  boots: "v2_unexplored_frostbreaker_boots",
  necklace: "v2_unexplored_icewall_core_necklace",
} as const;

const DEEP_ARCANE_SPECIALTY = {
  weapon: "v2_unexplored_deep_alchemy_staff",
  armor: "v2_unexplored_mana_cycle_robe",
  ring: "v2_unexplored_abyss_catalyst_ring",
} as const;

const TOXIC_BLOOD_BOSS_UNIQUES = {
  weapon: "v2_unexplored_toxic_blood_claw",
  armor: "v2_unexplored_uncorrupted_heart",
  ring: "v2_unexplored_coagulated_venom_ring",
} as const;

const GLACIAL_GUARD_BOSS_UNIQUES = {
  weapon: "v2_unexplored_glacial_crushing_hammer",
  armor: "v2_unexplored_frozen_great_armor",
  necklace: "v2_unexplored_absolute_zero_core",
} as const;

const SPECIALTY_BOSS_ITEM_PAIRS = [
  {
    setId: "tracking",
    slot: "boots",
    specialtyId: "v2_unexplored_shadow_leap_boots",
    bossUniqueId: "v2_unexplored_phantom_acceleration_boots",
  },
  {
    setId: "toxic_blood",
    slot: "armor",
    specialtyId: "v2_unexplored_toxic_blood_erosion_armor",
    bossUniqueId: "v2_unexplored_uncorrupted_heart",
  },
  {
    setId: "toxic_blood",
    slot: "ring",
    specialtyId: "v2_unexplored_lord_pulse_ring",
    bossUniqueId: "v2_unexplored_coagulated_venom_ring",
  },
  {
    setId: "glacial_guard",
    slot: "armor",
    specialtyId: "v2_unexplored_colossus_wall_armor",
    bossUniqueId: "v2_unexplored_frozen_great_armor",
  },
  {
    setId: "glacial_guard",
    slot: "necklace",
    specialtyId: "v2_unexplored_icewall_core_necklace",
    bossUniqueId: "v2_unexplored_absolute_zero_core",
  },
] as const satisfies readonly {
  setId: UnexploredSpecialtySetId;
  slot: V2EquipSlot;
  specialtyId: V2EquipmentId;
  bossUniqueId: V2EquipmentId;
}[];

const STORM_TRACKING: SpecialtyEquipmentLoadout = {
  weapon: "v2_storm_gale_bow",
  armor: "v2_storm_gale_armor",
  gloves: "v2_storm_gale_gloves",
  boots: "v2_storm_gale_boots",
  ring: "v2_storm_gale_ring",
  necklace: "v2_storm_gale_necklace",
};

const STORM_TOXIC_BLOOD: SpecialtyEquipmentLoadout = {
  weapon: "v2_storm_venom_dagger",
  armor: "v2_storm_venom_armor",
  gloves: "v2_storm_venom_gloves",
  boots: "v2_storm_venom_boots",
  ring: "v2_storm_venom_ring",
  necklace: "v2_storm_venom_necklace",
};

const STORM_GLACIAL_GUARD: SpecialtyEquipmentLoadout = {
  weapon: "v2_storm_wreckage_greatsword",
  armor: "v2_storm_wreckage_armor",
  gloves: "v2_storm_wreckage_gloves",
  boots: "v2_storm_wreckage_boots",
  ring: "v2_storm_wreckage_ring",
  necklace: "v2_storm_wreckage_necklace",
};

const STORM_DEEP_ARCANE: SpecialtyEquipmentLoadout = {
  weapon: "v2_storm_thunder_staff",
  armor: "v2_storm_thunder_armor",
  gloves: "v2_storm_thunder_gloves",
  boots: "v2_storm_thunder_boots",
  ring: "v2_storm_thunder_ring",
  necklace: "v2_storm_thunder_necklace",
};

const PIONEER_DEX: SpecialtyEquipmentLoadout = {
  weapon: "v2_pioneer_flawless_longbow",
  armor: "v2_pioneer_pulsing_bio_armor",
  gloves: "v2_pioneer_flawless_aim_gloves",
  boots: "v2_pioneer_tracefree_boots",
  ring: "v2_pioneer_focused_crystal_ring",
  necklace: "v2_pioneer_refraction_core",
};

const PIONEER_LUK: SpecialtyEquipmentLoadout = {
  weapon: "v2_pioneer_pulsing_devourer_dagger",
  armor: "v2_pioneer_pulsing_bio_armor",
  gloves: "v2_pioneer_bloodlight_gauntlets",
  boots: "v2_pioneer_berserk_boots",
  ring: "v2_pioneer_focused_crystal_ring",
  necklace: "v2_pioneer_mana_barrier_core",
};

const PIONEER_VIT: SpecialtyEquipmentLoadout = {
  weapon: "v2_pioneer_ironstar_greatsword",
  armor: "v2_pioneer_iron_wall_armor",
  gloves: "v2_pioneer_iron_guard_gloves",
  boots: "v2_pioneer_berserk_boots",
  ring: "v2_pioneer_regrowth_ring",
  necklace: "v2_pioneer_mana_barrier_core",
};

const PIONEER_INT: SpecialtyEquipmentLoadout = {
  weapon: "v2_pioneer_refracting_crystal_staff",
  armor: "v2_pioneer_barrier_woven_armor",
  gloves: "v2_pioneer_iron_guard_gloves",
  boots: "v2_pioneer_tracefree_boots",
  ring: "v2_pioneer_focused_crystal_ring",
  necklace: "v2_pioneer_refraction_core",
};

function replaceLoadout(
  base: SpecialtyEquipmentLoadout,
  replacements: Partial<SpecialtyEquipmentLoadout>,
): SpecialtyEquipmentLoadout {
  return { ...base, ...replacements };
}

export const SPECIALTY_LOADOUTS: Record<
  UnexploredSpecialtySetId,
  SpecialtyLoadoutDefinition
> = {
  tracking: {
    arch: "DEX",
    specialtyLabels: ["암영 가속", "추적 연쇄"],
    storm: STORM_TRACKING,
    stormTransition: replaceLoadout(STORM_TRACKING, TRACKING_SPECIALTY),
    pioneer: PIONEER_DEX,
    pioneerTransition: replaceLoadout(PIONEER_DEX, TRACKING_SPECIALTY),
  },
  toxic_blood: {
    arch: "LUK",
    specialtyLabels: ["군락독", "혈흔 개방"],
    storm: STORM_TOXIC_BLOOD,
    stormTransition: replaceLoadout(
      STORM_TOXIC_BLOOD,
      TOXIC_BLOOD_SPECIALTY,
    ),
    pioneer: PIONEER_LUK,
    pioneerTransition: replaceLoadout(PIONEER_LUK, TOXIC_BLOOD_SPECIALTY),
    bossReference: replaceLoadout(PIONEER_LUK, TOXIC_BLOOD_BOSS_UNIQUES),
  },
  glacial_guard: {
    arch: "VIT",
    specialtyLabels: ["빙벽 전개", "거수 압축"],
    storm: STORM_GLACIAL_GUARD,
    stormTransition: replaceLoadout(
      STORM_GLACIAL_GUARD,
      GLACIAL_GUARD_SPECIALTY,
    ),
    pioneer: PIONEER_VIT,
    pioneerTransition: replaceLoadout(
      PIONEER_VIT,
      GLACIAL_GUARD_SPECIALTY,
    ),
    bossReference: replaceLoadout(PIONEER_VIT, GLACIAL_GUARD_BOSS_UNIQUES),
  },
  deep_arcane: {
    arch: "INT",
    specialtyLabels: ["마력 재순환", "심층 방전"],
    storm: STORM_DEEP_ARCANE,
    stormTransition: replaceLoadout(STORM_DEEP_ARCANE, DEEP_ARCANE_SPECIALTY),
    pioneer: PIONEER_INT,
    pioneerTransition: replaceLoadout(PIONEER_INT, DEEP_ARCANE_SPECIALTY),
  },
};

export type SpecialtyScenarioId =
  | "short_dummy"
  | "long_dummy"
  | "evasive"
  | "armored"
  | "physical_flurry"
  | "magic_burst"
  | "status_pressure";

type SpecialtyScenario = {
  id: SpecialtyScenarioId;
  monster: Monster;
  maxTurns: number;
};

function fixture(
  id: SpecialtyScenarioId,
  overrides: Partial<Monster>,
  maxTurns: number,
): SpecialtyScenario {
  return {
    id,
    maxTurns,
    monster: {
      name: `특화 검증 ${id}`,
      tags: ["golem"],
      hp: 1_000_000_000,
      atk: 0,
      def: 80,
      magicDef: 80,
      spd: 30,
      directActionSpd: true,
      exp: 0,
      ...overrides,
    },
  };
}

export const SPECIALTY_PVE_SCENARIOS: readonly SpecialtyScenario[] = [
  fixture("short_dummy", {}, 12),
  fixture("long_dummy", { def: 120, magicDef: 120 }, 80),
  fixture("evasive", { def: 100, magicDef: 100, evasionPct: 28 }, 60),
  fixture(
    "armored",
    { def: 420, magicDef: 320, statusDamageReductionPct: 10 },
    80,
  ),
  fixture(
    "physical_flurry",
    { atk: 2_100, def: 180, magicDef: 180, spd: 105, bonusAttackChancePct: 100 },
    60,
  ),
  fixture(
    "magic_burst",
    { atk: 2_500, atkType: "magic", def: 180, magicDef: 180, spd: 70, critPct: 20 },
    60,
  ),
  fixture(
    "status_pressure",
    {
      atk: 1_500,
      atkType: "magic",
      def: 180,
      magicDef: 180,
      spd: 85,
      skill: {
        kind: "curse",
        name: "침식 압력",
        perHit: 2,
        dmgPerStack: 180,
        threshold: 6,
        maxStacks: 12,
        magicDefMitigationFraction: 0.2,
        damageTakenPctPerStack: 2,
        maxDamageTakenPct: 20,
      },
    },
    60,
  ),
];

export type SpecialtyPveSummary = {
  scenarioId: SpecialtyScenarioId;
  trials: number;
  winRatePct: number;
  medianDamagePer1000Ticks: number;
  medianSurvivalTicks: number;
  medianEndingHpRatio: number;
  medianEndingMpRatio: number;
  medianPlayerActions: number;
  medianDirectHits: number;
  signatureTriggers: Record<string, number>;
};

export type SpecialtyPveComparison = {
  loadout: SpecialtyLoadoutKey;
  scenarios: SpecialtyPveSummary[];
};

export type SpecialtyPveSetReport = {
  setId: UnexploredSpecialtySetId;
  arch: SpecialtyLoadoutDefinition["arch"];
  comparisons: SpecialtyPveComparison[];
};

export type UnexploredSpecialtyBalanceReport = {
  seed: number;
  pveTrials: number;
  pvpPairs: number;
  pve: SpecialtyPveSetReport[];
  pvp: SpecialtyPvpSetReport[];
  equipmentComparisons: SpecialtyEquipmentComparison[];
  ratios: SpecialtyComparisonRatio[];
};

export type SpecialtyEquipmentSnapshot = {
  id: V2EquipmentId;
  name: string;
  power: number;
  options: V2EquipOptions;
};

export type SpecialtyEquipmentComparison = {
  setId: UnexploredSpecialtySetId;
  slot: V2EquipSlot;
  specialty: SpecialtyEquipmentSnapshot;
  bossUnique: SpecialtyEquipmentSnapshot;
};

export type SpecialtyComparisonRatio = {
  setId: UnexploredSpecialtySetId;
  stormRoleRatio: number | null;
  pioneerRoleRatio: number | null;
  bossRoleRatio: number | null;
  bossSurvivalRatio: number | null;
};

export type SpecialtyPvpSetReport = {
  setId: UnexploredSpecialtySetId;
  pairs: number;
  battles: number;
  specialtyWins: number;
  baselineWins: number;
  draws: number;
  specialtyWinRatePct: number;
};

export type SpecialtyBalanceViolation = {
  code:
    | "PVE_STORM_RANGE"
    | "PVE_PIONEER_RANGE"
    | "PVE_NICHE"
    | "PVE_BOSS_UNIQUE_CAP"
    | "PVP_SOFT_CAP"
    | "PVP_HARD_CAP";
  setId: UnexploredSpecialtySetId;
  message: string;
};

export type SpecialtyBalanceViolations = {
  warnings: SpecialtyBalanceViolation[];
  failures: SpecialtyBalanceViolation[];
};

const SURVIVAL_SCENARIOS: readonly SpecialtyScenarioId[] = [
  "physical_flurry",
  "magic_burst",
  "status_pressure",
];

function pveComparison(
  entry: SpecialtyPveSetReport,
  key: SpecialtyLoadoutKey,
): SpecialtyPveComparison | undefined {
  return entry.comparisons.find((candidate) => candidate.loadout === key);
}

function pveScenario(
  entry: SpecialtyPveComparison | undefined,
  id: SpecialtyScenarioId,
): SpecialtyPveSummary | undefined {
  return entry?.scenarios.find((candidate) => candidate.scenarioId === id);
}

function safeRatio(value: number, baseline: number): number | null {
  return baseline > 0 && Number.isFinite(value) && Number.isFinite(baseline)
    ? value / baseline
    : null;
}

function survivalScore(entry: SpecialtyPveComparison | undefined): number {
  const values = SURVIVAL_SCENARIOS.map(
    (id) => pveScenario(entry, id)?.medianSurvivalTicks ?? 0,
  );
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roleScore(
  setId: UnexploredSpecialtySetId,
  entry: SpecialtyPveComparison | undefined,
): number {
  return setId === "glacial_guard"
    ? survivalScore(entry)
    : (pveScenario(entry, "long_dummy")?.medianDamagePer1000Ticks ?? 0);
}

function buildSpecialtyComparisonRatios(
  pve: readonly SpecialtyPveSetReport[],
): SpecialtyComparisonRatio[] {
  return pve.map((entry) => {
    const storm = pveComparison(entry, "storm");
    const stormTransition = pveComparison(entry, "stormTransition");
    const pioneer = pveComparison(entry, "pioneer");
    const pioneerTransition = pveComparison(entry, "pioneerTransition");
    const bossReference = pveComparison(entry, "bossReference");
    return {
      setId: entry.setId,
      stormRoleRatio: safeRatio(
        roleScore(entry.setId, stormTransition),
        roleScore(entry.setId, storm),
      ),
      pioneerRoleRatio: safeRatio(
        roleScore(entry.setId, pioneerTransition),
        roleScore(entry.setId, pioneer),
      ),
      bossRoleRatio: bossReference
        ? safeRatio(
            roleScore(entry.setId, pioneerTransition),
            roleScore(entry.setId, bossReference),
          )
        : null,
      bossSurvivalRatio: bossReference
        ? safeRatio(
            survivalScore(pioneerTransition),
            survivalScore(bossReference),
          )
        : null,
    };
  });
}

function equipmentSnapshot(id: V2EquipmentId): SpecialtyEquipmentSnapshot {
  const item = V2_EQUIPMENT[id];
  if (!item) throw new Error(`장비 카탈로그에 ${id}가 없습니다.`);
  return {
    id: item.id,
    name: item.name,
    power: item.power,
    options: { ...(item.options ?? {}) },
  };
}

function buildSpecialtyEquipmentComparisons(): SpecialtyEquipmentComparison[] {
  return SPECIALTY_BOSS_ITEM_PAIRS.map((pair) => {
    const specialty = V2_EQUIPMENT[pair.specialtyId];
    const bossUnique = V2_EQUIPMENT[pair.bossUniqueId];
    if (specialty.slot !== pair.slot || bossUnique.slot !== pair.slot) {
      throw new Error(
        `${pair.setId} 장비 비교 슬롯이 ${pair.slot}과 일치하지 않습니다.`,
      );
    }
    return {
      setId: pair.setId,
      slot: pair.slot,
      specialty: equipmentSnapshot(pair.specialtyId),
      bossUnique: equipmentSnapshot(pair.bossUniqueId),
    };
  });
}

function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function hashSeed(...parts: readonly (string | number)[]): number {
  let hash = 2_166_136_261;
  for (const character of parts.join(":")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function withSeededRandom<T>(seed: number, run: () => T): T {
  const original = Math.random;
  Math.random = mulberry32(seed);
  try {
    return run();
  } finally {
    Math.random = original;
  }
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function countSignatureTriggers(
  labels: readonly string[],
  texts: readonly string[],
): Record<string, number> {
  return Object.fromEntries(
    labels.map((label) => [
      label,
      texts.filter((text) => text.includes(`[${label}]`)).length,
    ]),
  );
}

function runPveScenario(args: {
  setId: UnexploredSpecialtySetId;
  loadoutKey: SpecialtyLoadoutKey;
  scenario: SpecialtyScenario;
  trials: number;
  seed: number;
}): SpecialtyPveSummary {
  const definition = SPECIALTY_LOADOUTS[args.setId];
  const equipment = definition[args.loadoutKey];
  if (!equipment) {
    throw new Error(`${args.setId}에 ${args.loadoutKey} 장비 조합이 없습니다.`);
  }
  const snapshot = buildLevelDesignProgressionSnapshot({
    arch: definition.arch,
    depth: 84,
    careerWins: 500_000,
    cultivate: true,
    seed: args.seed,
    equipment,
  });
  const playerMaxMp = Math.max(
    0,
    snapshot.player.maxMp ?? snapshot.player.mp ?? 0,
  );
  const damagePer1000Ticks: number[] = [];
  const survivalTicks: number[] = [];
  const endingHpRatios: number[] = [];
  const endingMpRatios: number[] = [];
  const playerActions: number[] = [];
  const directHits: number[] = [];
  const triggerTotals = Object.fromEntries(
    definition.specialtyLabels.map((label) => [label, 0]),
  );
  let wins = 0;

  for (let trial = 0; trial < args.trials; trial += 1) {
    const result = withSeededRandom(
      hashSeed(
        args.seed,
        args.setId,
        args.loadoutKey,
        args.scenario.id,
        trial,
      ),
      () =>
        resolveBattleAtb(
          {
            ...snapshot.player,
            hp: snapshot.player.maxHp,
            mp: playerMaxMp,
          },
          args.scenario.monster,
          `${args.setId}:${args.loadoutKey}`,
          {
            pickAction: (state) =>
              pickAutoAction(state, { rules: [], potions: {} }),
            potions: {},
            v2Skills: snapshot.v2Skills,
            forceAtbSkills: true,
            maxTurns: args.scenario.maxTurns,
          },
        ),
    );
    if (result.outcome === "win") wins += 1;
    const ticks = Math.max(
      1,
      ...result.finalState.log.map((entry) => entry.t ?? 0),
    );
    const damage = Math.max(
      0,
      args.scenario.monster.hp - result.finalState.enemyHp,
    );
    damagePer1000Ticks.push((damage / ticks) * 1_000);
    survivalTicks.push(ticks);
    endingHpRatios.push(
      Math.max(0, result.finalState.playerHp) / snapshot.player.maxHp,
    );
    endingMpRatios.push(
      playerMaxMp > 0
        ? Math.max(0, result.finalState.playerMp) / playerMaxMp
        : 0,
    );
    playerActions.push(result.turns);
    directHits.push(
      result.finalState.log.reduce(
        (sum, entry) => sum + (entry.kind === "player_attack" ? (entry.directHits ?? 1) : 0),
        0,
      ),
    );
    const triggers = countSignatureTriggers(
      definition.specialtyLabels,
      result.finalState.log.map((entry) => entry.text),
    );
    for (const label of definition.specialtyLabels) {
      triggerTotals[label] += triggers[label] ?? 0;
    }
  }

  return {
    scenarioId: args.scenario.id,
    trials: args.trials,
    winRatePct: args.trials > 0 ? (wins / args.trials) * 100 : 0,
    medianDamagePer1000Ticks: finite(median(damagePer1000Ticks)),
    medianSurvivalTicks: finite(median(survivalTicks)),
    medianEndingHpRatio: finite(median(endingHpRatios)),
    medianEndingMpRatio: finite(median(endingMpRatios)),
    medianPlayerActions: finite(median(playerActions)),
    medianDirectHits: finite(median(directHits)),
    signatureTriggers: triggerTotals,
  };
}

function runPvpSet(args: {
  setId: UnexploredSpecialtySetId;
  pairs: number;
  seed: number;
}): SpecialtyPvpSetReport {
  const definition = SPECIALTY_LOADOUTS[args.setId];
  const baseline = buildLevelDesignProgressionSnapshot({
    arch: definition.arch,
    depth: 84,
    careerWins: 500_000,
    cultivate: true,
    seed: args.seed,
    equipment: definition.pioneer,
  });
  const specialty = buildLevelDesignProgressionSnapshot({
    arch: definition.arch,
    depth: 84,
    careerWins: 500_000,
    cultivate: true,
    seed: args.seed,
    equipment: definition.pioneerTransition,
  });
  let specialtyWins = 0;
  let baselineWins = 0;
  let draws = 0;

  const record = (
    outcome: "p1_win" | "p2_win" | "draw",
    specialtySide: "p1" | "p2",
  ) => {
    if (outcome === "draw") {
      draws += 1;
    } else if (outcome === `${specialtySide}_win`) {
      specialtyWins += 1;
    } else {
      baselineWins += 1;
    }
  };

  for (let pair = 0; pair < args.pairs; pair += 1) {
    const pairSeed = hashSeed(args.seed, args.setId, "pvp", pair);
    const specialtyFirst = withSeededRandom(pairSeed, () =>
      resolveBattlePvPAtb(
        { ...specialty.player, hp: specialty.player.maxHp, mp: specialty.player.maxMp },
        { ...baseline.player, hp: baseline.player.maxHp, mp: baseline.player.maxMp },
        `${args.setId}:specialty`,
        `${args.setId}:baseline`,
        {
          pickAction: () => ({ kind: "attack" }),
          potions: { p1: {}, p2: {} },
          initiativeRoll: 0,
          v2Skills: { p1: specialty.v2Skills, p2: baseline.v2Skills },
        },
      ),
    );
    record(specialtyFirst.outcome, "p1");

    const baselineFirst = withSeededRandom(pairSeed, () =>
      resolveBattlePvPAtb(
        { ...baseline.player, hp: baseline.player.maxHp, mp: baseline.player.maxMp },
        { ...specialty.player, hp: specialty.player.maxHp, mp: specialty.player.maxMp },
        `${args.setId}:baseline`,
        `${args.setId}:specialty`,
        {
          pickAction: () => ({ kind: "attack" }),
          potions: { p1: {}, p2: {} },
          initiativeRoll: 0,
          v2Skills: { p1: baseline.v2Skills, p2: specialty.v2Skills },
        },
      ),
    );
    record(baselineFirst.outcome, "p2");
  }

  const battles = args.pairs * 2;
  return {
    setId: args.setId,
    pairs: args.pairs,
    battles,
    specialtyWins,
    baselineWins,
    draws,
    specialtyWinRatePct:
      battles > 0 ? ((specialtyWins + draws * 0.5) / battles) * 100 : 0,
  };
}

export function unexploredSpecialtyBalanceViolations(
  report: UnexploredSpecialtyBalanceReport,
): SpecialtyBalanceViolations {
  const warnings: SpecialtyBalanceViolation[] = [];
  const failures: SpecialtyBalanceViolation[] = [];
  const comparison = pveComparison;
  const scenario = pveScenario;
  const ratioLabel = (value: number | null): string =>
    value == null ? "분모 없음" : `${value.toFixed(3)}배`;

  for (const entry of report.pve) {
    const pioneer = comparison(entry, "pioneer");
    const pioneerTransition = comparison(entry, "pioneerTransition");
    const pioneerRatio = safeRatio(
      roleScore(entry.setId, pioneerTransition),
      roleScore(entry.setId, pioneer),
    );
    if (pioneerRatio == null || pioneerRatio < 0.97 || pioneerRatio > 1.08) {
      failures.push({
        code: "PVE_PIONEER_RANGE",
        setId: entry.setId,
        message: `${entry.setId} 개척자 기준 주 역할 ${ratioLabel(pioneerRatio)}가 0.97~1.08 범위를 벗어났습니다.`,
      });
    }

    const pioneerLong = scenario(pioneer, "long_dummy");
    const transitionLong = scenario(pioneerTransition, "long_dummy");
    let nichePassed = false;
    if (entry.setId === "tracking") {
      const damageRatio = safeRatio(
        transitionLong?.medianDamagePer1000Ticks ?? 0,
        pioneerLong?.medianDamagePer1000Ticks ?? 0,
      );
      const actionRate = (summary: SpecialtyPveSummary | undefined): number =>
        summary && summary.medianSurvivalTicks > 0
          ? (summary.medianPlayerActions / summary.medianSurvivalTicks) * 1_000
          : 0;
      const actionRatio = safeRatio(
        actionRate(transitionLong),
        actionRate(pioneerLong),
      );
      nichePassed =
        damageRatio != null &&
        actionRatio != null &&
        ((damageRatio >= 1.03 && actionRatio >= 0.95) ||
          (actionRatio >= 1.03 && damageRatio >= 0.95));
    } else if (entry.setId === "toxic_blood") {
      const damageRatio = safeRatio(
        transitionLong?.medianDamagePer1000Ticks ?? 0,
        pioneerLong?.medianDamagePer1000Ticks ?? 0,
      );
      const transitionDots = Object.values(
        transitionLong?.signatureTriggers ?? {},
      ).reduce((sum, value) => sum + value, 0);
      const pioneerDots = Object.values(
        pioneerLong?.signatureTriggers ?? {},
      ).reduce((sum, value) => sum + value, 0);
      nichePassed =
        damageRatio != null &&
        damageRatio >= 0.97 &&
        damageRatio <= 1.08 &&
        transitionDots > pioneerDots * 1.05;
    } else if (entry.setId === "glacial_guard") {
      const improved = SURVIVAL_SCENARIOS.filter((id) => {
        const base = scenario(pioneer, id);
        const next = scenario(pioneerTransition, id);
        if (!base || !next) return false;
        const survivalRatio = safeRatio(
          next.medianSurvivalTicks,
          base.medianSurvivalTicks,
        );
        const baseDamageTaken = 1 - base.medianEndingHpRatio;
        const nextDamageTaken = 1 - next.medianEndingHpRatio;
        const damageTakenBetter =
          baseDamageTaken > 0 && nextDamageTaken <= baseDamageTaken * 0.97;
        return (survivalRatio ?? 0) >= 1.03 || damageTakenBetter;
      }).length;
      const offenseRatio = safeRatio(
        transitionLong?.medianDamagePer1000Ticks ?? 0,
        pioneerLong?.medianDamagePer1000Ticks ?? 0,
      );
      nichePassed = improved >= 1 && offenseRatio != null && offenseRatio >= 0.9;
    } else {
      const damageRatio = safeRatio(
        transitionLong?.medianDamagePer1000Ticks ?? 0,
        pioneerLong?.medianDamagePer1000Ticks ?? 0,
      );
      const baseMp = pioneerLong?.medianEndingMpRatio ?? 0;
      const nextMp = transitionLong?.medianEndingMpRatio ?? 0;
      const resourceBetter =
        baseMp > 0 ? nextMp >= baseMp * 1.05 : nextMp > baseMp;
      nichePassed =
        damageRatio != null &&
        damageRatio >= 0.97 &&
        damageRatio <= 1.08 &&
        resourceBetter;
    }
    if (!nichePassed) {
      failures.push({
        code: "PVE_NICHE",
        setId: entry.setId,
        message: `${entry.setId} 전문 분야 조건을 충족하지 못했습니다.`,
      });
    }

    const bossReference = comparison(entry, "bossReference");
    if (bossReference) {
      const roleRatio = safeRatio(
        roleScore(entry.setId, pioneerTransition),
        roleScore(entry.setId, bossReference),
      );
      const survivalRatio = safeRatio(
        survivalScore(pioneerTransition),
        survivalScore(bossReference),
      );
      if (
        roleRatio != null &&
        survivalRatio != null &&
        roleRatio > 1.05 &&
        survivalRatio > 1.05
      ) {
        failures.push({
          code: "PVE_BOSS_UNIQUE_CAP",
          setId: entry.setId,
          message:
            `${entry.setId} 신규 전환 조합이 보스 고유 참고 조합보다 ` +
            `주 역할 ${ratioLabel(roleRatio)}, 생존 ${ratioLabel(survivalRatio)}로 모두 1.05배를 넘었습니다.`,
        });
      }
    }
  }

  for (const entry of report.pvp) {
    if (entry.specialtyWinRatePct > 62) {
      failures.push({
        code: "PVP_HARD_CAP",
        setId: entry.setId,
        message: `${entry.setId} PvP 승률 ${entry.specialtyWinRatePct.toFixed(2)}%가 62% 상한을 넘었습니다.`,
      });
    } else if (entry.specialtyWinRatePct > 60) {
      warnings.push({
        code: "PVP_SOFT_CAP",
        setId: entry.setId,
        message: `${entry.setId} PvP 승률 ${entry.specialtyWinRatePct.toFixed(2)}%가 60% 목표를 넘었습니다.`,
      });
    }
  }
  return { warnings, failures };
}

function validateCount(value: number, label: string): number {
  const normalized = Math.floor(value);
  if (!Number.isFinite(normalized) || normalized < 0 || normalized > 1_000) {
    throw new Error(`${label} must be between 0 and 1000`);
  }
  return normalized;
}

export function buildUnexploredSpecialtyBalanceReport(options?: {
  pveTrials?: number;
  pvpPairs?: number;
  seed?: number;
}): UnexploredSpecialtyBalanceReport {
  const seed = Math.floor(options?.seed ?? 20260831);
  const pveTrials = validateCount(options?.pveTrials ?? 200, "pveTrials");
  const pvpPairs = validateCount(options?.pvpPairs ?? 400, "pvpPairs");
  const baseLoadoutKeys: readonly SpecialtyLoadoutKey[] = [
    "storm",
    "stormTransition",
    "pioneer",
    "pioneerTransition",
  ];
  const setIds = Object.keys(SPECIALTY_LOADOUTS) as UnexploredSpecialtySetId[];
  const pve = pveTrials === 0
    ? []
    : setIds.map((setId) => {
        const definition = SPECIALTY_LOADOUTS[setId];
        const loadoutKeys: readonly SpecialtyLoadoutKey[] =
          definition.bossReference
            ? [...baseLoadoutKeys, "bossReference"]
            : baseLoadoutKeys;
        return {
          setId,
          arch: definition.arch,
          comparisons: loadoutKeys.map((loadoutKey) => ({
            loadout: loadoutKey,
            scenarios: SPECIALTY_PVE_SCENARIOS.map((scenario) =>
              runPveScenario({
                setId,
                loadoutKey,
                scenario,
                trials: pveTrials,
                seed,
              }),
            ),
          })),
        };
      });
  const pvp = pvpPairs === 0
    ? []
    : setIds.map((setId) => runPvpSet({ setId, pairs: pvpPairs, seed }));
  const equipmentComparisons = buildSpecialtyEquipmentComparisons();
  const ratios = buildSpecialtyComparisonRatios(pve);

  return {
    seed,
    pveTrials,
    pvpPairs,
    pve,
    pvp,
    equipmentComparisons,
    ratios,
  };
}

function cliInteger(
  args: readonly string[],
  name: string,
  fallback: number,
  max = 1_000,
): number {
  const equals = args.find((arg) => arg.startsWith(`${name}=`));
  const index = args.indexOf(name);
  const raw = equals?.slice(name.length + 1) ?? (index >= 0 ? args[index + 1] : undefined);
  if (raw == null) return fallback;
  const value = Math.floor(Number(raw));
  if (!Number.isFinite(value) || value < 0 || value > max) {
    throw new Error(`${name.slice(2)} must be between 0 and ${max}`);
  }
  return value;
}

const EQUIPMENT_OPTION_LABELS: Record<keyof V2EquipOptions, string> = {
  crit: "치명",
  eva: "회피",
  accuracy: "명중",
  mp: "MP",
  hp: "HP",
  critMult: "치명피해",
  spd: "속도",
  def: "방어",
  magicDef: "마방",
  healPowerPct: "회복량",
  critResist: "치명저항",
  statusDamageReductionPct: "상태피해감소",
};

function equipmentOptionSummary(options: V2EquipOptions): string {
  const entries = Object.entries(options) as [keyof V2EquipOptions, number][];
  return entries.length === 0
    ? "옵션 없음"
    : entries
        .map(([key, value]) => `${EQUIPMENT_OPTION_LABELS[key]} ${value}`)
        .join(", ");
}

function ratioText(value: number | null): string {
  return value == null ? "-" : value.toFixed(3);
}

function printCompactReport(
  report: UnexploredSpecialtyBalanceReport,
  violations: SpecialtyBalanceViolations,
): void {
  console.log(
    `미개척지 특화 세트 실전 검증 · seed ${report.seed} · PvE ${report.pveTrials}회 · PvP ${report.pvpPairs}쌍`,
  );
  if (report.pve.length > 0) {
    console.log("세트 | 조합 | 장기 피해/1000틱 | 생존 3종 평균틱 | 종료 MP");
    for (const entry of report.pve) {
      for (const comparison of entry.comparisons) {
        const long = comparison.scenarios.find(
          (candidate) => candidate.scenarioId === "long_dummy",
        );
        const survival = SURVIVAL_SCENARIOS.map(
          (id) =>
            comparison.scenarios.find((candidate) => candidate.scenarioId === id)
              ?.medianSurvivalTicks ?? 0,
        );
        const meanSurvival =
          survival.reduce((sum, value) => sum + value, 0) / survival.length;
        console.log(
          [
            entry.setId,
            comparison.loadout,
            Math.round(long?.medianDamagePer1000Ticks ?? 0).toLocaleString("ko-KR"),
            Math.round(meanSurvival).toLocaleString("ko-KR"),
            `${((long?.medianEndingMpRatio ?? 0) * 100).toFixed(1)}%`,
          ].join(" | "),
        );
      }
    }
    console.log(
      "세트 | 폭풍 전환/폭풍 | 개척자 전환/개척자 | 전환/보스 역할 | 전환/보스 생존",
    );
    for (const entry of report.ratios) {
      console.log(
        [
          entry.setId,
          ratioText(entry.stormRoleRatio),
          ratioText(entry.pioneerRoleRatio),
          ratioText(entry.bossRoleRatio),
          ratioText(entry.bossSurvivalRatio),
        ].join(" | "),
      );
    }
  }
  if (report.equipmentComparisons.length > 0) {
    console.log(
      "세트 | 슬롯 | 특화 장비(위력·옵션) | 보스 고유(위력·옵션)",
    );
    for (const entry of report.equipmentComparisons) {
      const itemText = (item: SpecialtyEquipmentSnapshot): string =>
        `${item.name}(${item.power}; ${equipmentOptionSummary(item.options)})`;
      console.log(
        [
          entry.setId,
          entry.slot,
          itemText(entry.specialty),
          itemText(entry.bossUnique),
        ].join(" | "),
      );
    }
  }
  if (report.pvp.length > 0) {
    console.log("세트 | PvP 승률 | 승-무-패");
    for (const entry of report.pvp) {
      console.log(
        `${entry.setId} | ${entry.specialtyWinRatePct.toFixed(2)}% | ${entry.specialtyWins}-${entry.draws}-${entry.baselineWins}`,
      );
    }
  }
  for (const warning of violations.warnings) console.warn(`[경고] ${warning.message}`);
  for (const failure of violations.failures) console.error(`[실패] ${failure.message}`);
  console.log(
    `결과 · 경고 ${violations.warnings.length}건 · 실패 ${violations.failures.length}건`,
  );
}

export function main(args: readonly string[] = process.argv.slice(2)): void {
  const pveTrials = cliInteger(args, "--pve-trials", 200);
  const pvpPairs = cliInteger(args, "--pvp-pairs", 400);
  const seed = cliInteger(args, "--seed", 20260831, 0xffff_ffff);
  if (pveTrials === 0 && pvpPairs === 0) {
    throw new Error("pveTrials와 pvpPairs를 동시에 0으로 실행할 수 없습니다.");
  }
  const report = buildUnexploredSpecialtyBalanceReport({
    pveTrials,
    pvpPairs,
    seed,
  });
  const violations = unexploredSpecialtyBalanceViolations(report);
  if (args.includes("--json")) {
    console.log(JSON.stringify({ report, violations }, null, 2));
  } else {
    printCompactReport(report, violations);
  }
  if (args.includes("--strict") && violations.failures.length > 0) {
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (invokedPath === import.meta.url) main();
