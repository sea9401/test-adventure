import {
  EQUIPMENT_LIBERATION_GOLD_COST,
  EQUIPMENT_LIBERATION_LEVEL_DISTRIBUTIONS,
  EQUIPMENT_LIBERATION_LINE_COUNT_PROBABILITIES,
  EQUIPMENT_LIBERATION_PROMOTION_PROBABILITIES,
  rerollLiberation,
  rollInitialLiberation,
  type LiberationLineCount,
  type LiberationOptionRoll,
  type LiberationRank,
  type V2LiberationState,
} from "./equipmentLiberation";
import {
  EQUIPMENT_LIBERATION_POOLS,
  firstLineProbability,
  type LiberationOptionId,
} from "./equipmentLiberationCatalog";
import {
  deriveEquippedLiberationEffects,
  emptyEquippedLiberationEffects,
  type EquippedLiberationEffects,
} from "./equipmentLiberationEffects";
import { type V2Class } from "./classes";
import {
  LEGACY_CLASS_SPEC_BY_JOB,
  V2_JOB_CATALOG,
} from "./v2JobCatalog";
import {
  type V2EquipmentId,
  type V2EquipSlot,
} from "./v2Equipment";
import type { V2StatKey } from "./v2StatKeys";
import {
  derivePlayerCombatV2Pure,
  stackedDamageReductionPct,
  type DerivePlayerCombatV2PureInput,
} from "@/lib/server/derivePlayerCombatV2";

const SLOTS = [
  "weapon",
  "armor",
  "gloves",
  "boots",
  "ring",
  "necklace",
] as const satisfies readonly V2EquipSlot[];

const SIGMA_TOLERANCE = 5;

export type ProbabilityObservation = {
  count: number;
  samples: number;
  observedPct: number;
  theoreticalPct: number;
  standardErrorPct: number;
  tolerancePct: number;
  passed: boolean;
};

export type CombinationObservation = {
  count: number;
  samples: number;
  observedPct: number;
};

type CombinationSummary = {
  core: CombinationObservation;
  rare: CombinationObservation;
  chase: CombinationObservation;
  coreAndRare: CombinationObservation;
  rareAndChase: CombinationObservation;
  coreRareChase: CombinationObservation;
};

type CombatSettingSummary = {
  primaryDamageIndex: number;
  physicalEhpIndex: number;
  magicEhpIndex: number;
  maxHp: number;
  maxMp: number;
  primaryAttack: number;
  critChancePct: number;
  evasionPct: number;
  damageTakenReductionPct: number;
};

export type EquipmentLiberationSimulationSummary = {
  seed: number;
  iterations: number;
  sigmaTolerance: number;
  initialLineCounts: Record<LiberationLineCount, ProbabilityObservation>;
  rankLevelDistributions: Record<
    LiberationRank,
    Record<number, ProbabilityObservation>
  >;
  firstLineOptions: Record<
    V2EquipSlot,
    Partial<Record<LiberationOptionId, ProbabilityObservation>>
  >;
  promotions: {
    rank3To2: ProbabilityObservation;
    rank2To1: ProbabilityObservation;
    averageAttemptsRank3To2: number;
    averageAttemptsRank2To1: number;
    averageGoldToRank1: number;
  };
  representativeCombinations: Record<LiberationLineCount, CombinationSummary>;
  combat: Array<{
    jobId: string;
    jobName: string;
    archetype:
      | "physical_low_defense"
      | "magic_high_defense"
      | "critical_evasion"
      | "tanking";
    settings: Record<
      "none" | "averageRank3" | "averageRank2" | "topRank1",
      CombatSettingSummary
    >;
  }>;
  validation: {
    probabilityWarnings: string[];
    doubleApplicationWarnings: string[];
    warnings: string[];
  };
};

export function seededEquipmentLiberationRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value |= 0;
    value = (value + 0x6d2b79f5) | 0;
    let mixed = Math.imul(value ^ (value >>> 15), 1 | value);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function rounded(value: number, digits = 6): number {
  return Number(value.toFixed(digits));
}

function probabilityObservation(
  count: number,
  samples: number,
  theoreticalProbability: number,
): ProbabilityObservation {
  const observed = samples > 0 ? count / samples : 0;
  const standardError =
    samples > 0
      ? Math.sqrt(
          (theoreticalProbability * (1 - theoreticalProbability)) / samples,
        )
      : 0;
  const tolerance = SIGMA_TOLERANCE * standardError;
  return {
    count,
    samples,
    observedPct: rounded(observed * 100),
    theoreticalPct: rounded(theoreticalProbability * 100),
    standardErrorPct: rounded(standardError * 100),
    tolerancePct: rounded(tolerance * 100),
    passed: Math.abs(observed - theoreticalProbability) <= tolerance,
  };
}

function combinationObservation(count: number, samples: number): CombinationObservation {
  return {
    count,
    samples,
    observedPct: rounded((samples > 0 ? count / samples : 0) * 100),
  };
}

type CombinationCounts = Record<keyof CombinationSummary, number>;

function emptyCombinationCounts(): CombinationCounts {
  return {
    core: 0,
    rare: 0,
    chase: 0,
    coreAndRare: 0,
    rareAndChase: 0,
    coreRareChase: 0,
  };
}

function recordCombination(
  counts: CombinationCounts,
  options: readonly LiberationOptionRoll[],
): void {
  const weightById = new Map(
    EQUIPMENT_LIBERATION_POOLS.weapon.map((entry) => [entry.id, entry.weight]),
  );
  const weights = new Set(options.map((option) => weightById.get(option.id)));
  const core = weights.has(40);
  const rare = weights.has(15);
  const chase = weights.has(5);
  if (core) counts.core += 1;
  if (rare) counts.rare += 1;
  if (chase) counts.chase += 1;
  if (core && rare) counts.coreAndRare += 1;
  if (rare && chase) counts.rareAndChase += 1;
  if (core && rare && chase) counts.coreRareChase += 1;
}

function fixedRankState(
  slot: V2EquipSlot,
  rank: LiberationRank,
): V2LiberationState {
  const level = EQUIPMENT_LIBERATION_LEVEL_DISTRIBUTIONS[rank][0][0];
  return {
    rank,
    lineCount: 1,
    revision: 1,
    options: [{ id: EQUIPMENT_LIBERATION_POOLS[slot][0].id, level }],
  };
}

const FIXED_TIER_6_EQUIPMENT = {
  weapon: "v2_storm_wreckage_greatsword",
  armor: "v2_storm_wreckage_armor",
  gloves: "v2_storm_wreckage_gloves",
  boots: "v2_storm_wreckage_boots",
  ring: "v2_storm_wreckage_ring",
  necklace: "v2_storm_wreckage_necklace",
} as const satisfies Record<V2EquipSlot, V2EquipmentId>;

type CombatSetting = "none" | "averageRank3" | "averageRank2" | "topRank1";

const COMBAT_OPTION_SETTINGS: Record<
  Exclude<CombatSetting, "none">,
  { rank: LiberationRank; level: number; options: Record<V2EquipSlot, LiberationOptionId[]> }
> = {
  averageRank3: {
    rank: 3,
    level: 3,
    options: {
      weapon: ["physical_attack_flat"],
      armor: ["base_vit_pct"],
      gloves: ["crit_chance_pp"],
      boots: ["evasion_flat"],
      ring: ["max_hp_flat"],
      necklace: ["max_mp_flat"],
    },
  },
  averageRank2: {
    rank: 2,
    level: 8,
    options: {
      weapon: ["physical_attack_flat", "magic_attack_flat"],
      armor: ["max_hp_pct", "physical_defense_pct"],
      gloves: ["crit_chance_pp", "crit_damage_pp"],
      boots: ["speed_flat", "evasion_flat"],
      ring: ["max_hp_flat", "crit_damage_pp"],
      necklace: ["max_mp_flat", "healing_output_pct"],
    },
  },
  topRank1: {
    rank: 1,
    level: 20,
    options: {
      weapon: ["physical_attack_pct", "magic_attack_pct", "all_damage_pct"],
      armor: ["max_hp_pct", "damage_taken_reduction_pct", "battle_start_shield_max_hp_pct"],
      gloves: ["crit_chance_pp", "skill_crit_damage_pp", "boss_damage_pct"],
      boots: ["speed_flat", "evasion_flat", "final_evasion_effect_pp"],
      ring: ["max_hp_flat", "crit_chance_pp", "crit_damage_pp"],
      necklace: ["max_mp_flat", "skill_mp_cost_reduction_pct", "healing_output_pct"],
    },
  },
};

function liberationEffectsForSetting(setting: CombatSetting): EquippedLiberationEffects | undefined {
  if (setting === "none") return undefined;
  const definition = COMBAT_OPTION_SETTINGS[setting];
  const owned = SLOTS.map((slot) => ({
    iid: `fixture-${slot}`,
    id: FIXED_TIER_6_EQUIPMENT[slot],
    liberation: {
      rank: definition.rank,
      lineCount: definition.options[slot].length,
      revision: 1,
      options: definition.options[slot].map((id) => ({
        id,
        level: definition.level,
      })),
    },
  }));
  return deriveEquippedLiberationEffects({
    owned,
    equipped: Object.fromEntries(
      SLOTS.map((slot) => [slot, `fixture-${slot}`]),
    ),
  });
}

type CombatFixture = {
  jobId: "guardian" | "magus" | "shadow" | "bishop";
  archetype: EquipmentLiberationSimulationSummary["combat"][number]["archetype"];
  primary: "physical" | "magic";
  enemyDefense: number;
  allocatedStats: Partial<Record<V2StatKey, number>>;
  equipment: Partial<Record<V2EquipSlot, V2EquipmentId>>;
};

const PHYSICAL_EQUIPMENT = { ...FIXED_TIER_6_EQUIPMENT };
const MAGIC_EQUIPMENT = {
  weapon: "v2_storm_thunder_staff",
  armor: "v2_storm_thunder_armor",
  gloves: "v2_storm_thunder_gloves",
  boots: "v2_storm_thunder_boots",
  ring: "v2_storm_thunder_ring",
  necklace: "v2_storm_thunder_necklace",
} as const satisfies Partial<Record<V2EquipSlot, V2EquipmentId>>;
const EVASION_EQUIPMENT = {
  weapon: "v2_storm_gale_dagger",
  armor: "v2_storm_shadow_armor",
  gloves: "v2_storm_shadow_gloves",
  boots: "v2_storm_shadow_boots",
  ring: "v2_storm_shadow_ring",
  necklace: "v2_storm_shadow_necklace",
} as const satisfies Partial<Record<V2EquipSlot, V2EquipmentId>>;

const COMBAT_FIXTURES: readonly CombatFixture[] = [
  {
    jobId: "guardian",
    archetype: "physical_low_defense",
    primary: "physical",
    enemyDefense: 350,
    allocatedStats: { str: 300, vit: 400, dex: 80, luk: 60 },
    equipment: PHYSICAL_EQUIPMENT,
  },
  {
    jobId: "magus",
    archetype: "magic_high_defense",
    primary: "magic",
    enemyDefense: 1_500,
    allocatedStats: { int: 420, spi: 260, vit: 100, luk: 80 },
    equipment: MAGIC_EQUIPMENT,
  },
  {
    jobId: "shadow",
    archetype: "critical_evasion",
    primary: "physical",
    enemyDefense: 800,
    allocatedStats: { dex: 380, luk: 380, str: 120, vit: 80 },
    equipment: EVASION_EQUIPMENT,
  },
  {
    jobId: "bishop",
    archetype: "tanking",
    primary: "magic",
    enemyDefense: 900,
    allocatedStats: { spi: 360, int: 280, vit: 260, str: 60 },
    equipment: MAGIC_EQUIPMENT,
  },
] as const;

function deriveFixture(
  fixture: CombatFixture,
  effects?: EquippedLiberationEffects,
) {
  const job = V2_JOB_CATALOG[fixture.jobId];
  const legacy = LEGACY_CLASS_SPEC_BY_JOB[fixture.jobId];
  return derivePlayerCombatV2Pure({
    level: 120,
    allocatedStats: fixture.allocatedStats,
    v2Equipped: fixture.equipment,
    playerClass: legacy.class as V2Class,
    classTier: job.tier,
    jobBonus: job.jobBonus,
    liberationEffects: effects,
  });
}

function damageScore(
  fixture: CombatFixture,
  derived: ReturnType<typeof deriveFixture>,
): number {
  const player = derived.player;
  const primaryAttack =
    fixture.primary === "physical" ? player.atk : (player.magicAtk ?? player.atk);
  const penetration =
    fixture.primary === "physical"
      ? (player.enemyPhysicalDefReductionPct ?? 0)
      : (player.enemyMagicDefReductionPct ?? 0);
  const effectiveDefense = fixture.enemyDefense * (1 - Math.min(100, penetration) / 100);
  const critChance = Math.min(75, Math.max(0, player.critChancePct ?? 0)) / 100;
  const skillCritMultiplier =
    (player.critMult ?? 1) + (player.skillCritDmgPct ?? 0) / 100;
  const expectedCritMultiplier = 1 + critChance * (skillCritMultiplier - 1);
  const bossMultiplier = 1 + (player.enchantBreakerBossBonusPct ?? 0) / 100;
  return (
    primaryAttack *
    expectedCritMultiplier *
    bossMultiplier *
    (100 / (100 + effectiveDefense))
  );
}

function ehpScore(
  derived: ReturnType<typeof deriveFixture>,
  defense: "physical" | "magic",
): number {
  const player = derived.player;
  const defenseValue = defense === "physical" ? player.def : (player.magicDef ?? 0);
  const reduction = Math.min(95, player.passiveDamageTakenReductionPct ?? 0) / 100;
  const shield = player.maxHp * ((player.enchantBarrierPctMaxHp ?? 0) / 100);
  return ((player.maxHp + shield) * (1 + defenseValue / 100)) / (1 - reduction);
}

function combatSummary() {
  const settingEffects: Record<CombatSetting, EquippedLiberationEffects | undefined> = {
    none: undefined,
    averageRank3: liberationEffectsForSetting("averageRank3"),
    averageRank2: liberationEffectsForSetting("averageRank2"),
    topRank1: liberationEffectsForSetting("topRank1"),
  };
  const settings = Object.keys(settingEffects) as CombatSetting[];

  return COMBAT_FIXTURES.map((fixture) => {
    const derivedBySetting = Object.fromEntries(
      settings.map((setting) => [setting, deriveFixture(fixture, settingEffects[setting])]),
    ) as Record<CombatSetting, ReturnType<typeof deriveFixture>>;
    const baselineDamage = damageScore(fixture, derivedBySetting.none);
    const baselinePhysicalEhp = ehpScore(derivedBySetting.none, "physical");
    const baselineMagicEhp = ehpScore(derivedBySetting.none, "magic");
    const rows = Object.fromEntries(
      settings.map((setting) => {
        const derived = derivedBySetting[setting];
        const player = derived.player;
        return [
          setting,
          {
            primaryDamageIndex: rounded(
              (damageScore(fixture, derived) / baselineDamage) * 100,
              2,
            ),
            physicalEhpIndex: rounded(
              (ehpScore(derived, "physical") / baselinePhysicalEhp) * 100,
              2,
            ),
            magicEhpIndex: rounded(
              (ehpScore(derived, "magic") / baselineMagicEhp) * 100,
              2,
            ),
            maxHp: player.maxHp,
            maxMp: player.maxMp ?? 0,
            primaryAttack:
              fixture.primary === "physical"
                ? player.atk
                : (player.magicAtk ?? player.atk),
            critChancePct: rounded(player.critChancePct ?? 0, 2),
            evasionPct: rounded(player.evasionPct ?? 0, 2),
            damageTakenReductionPct: rounded(
              player.passiveDamageTakenReductionPct ?? 0,
              2,
            ),
          } satisfies CombatSettingSummary,
        ];
      }),
    ) as Record<CombatSetting, CombatSettingSummary>;
    return {
      jobId: fixture.jobId,
      jobName: V2_JOB_CATALOG[fixture.jobId].name,
      archetype: fixture.archetype,
      settings: rows,
    };
  });
}

function singleAxisWarnings(): string[] {
  const warnings: string[] = [];
  const baseInput: DerivePlayerCombatV2PureInput = {
    level: 120,
    allocatedStats: { str: 300, dex: 250, vit: 250, int: 300, spi: 250, luk: 200 },
    v2Equipped: {},
    playerClass: "warrior",
    classTier: 3,
  };
  const baseline = derivePlayerCombatV2Pure(baseInput);

  const direct = emptyEquippedLiberationEffects();
  direct.pct.allDamage = 5;
  direct.combat.physicalPenetrationPct = 9;
  direct.combat.magicPenetrationPct = 9;
  direct.combat.skillCritDamagePp = 40;
  direct.combat.damageTakenReductionPct = 6;
  direct.combat.finalEvasionEffectPp = 5;
  const applied = derivePlayerCombatV2Pure({ ...baseInput, liberationEffects: direct });
  if (applied.player.atk !== Math.floor(baseline.player.atk * 1.05)) {
    warnings.push("모든 피해가 물리 공격 축에 한 번만 적용되지 않음");
  }
  if (
    applied.player.magicAtk !==
    Math.floor((baseline.player.magicAtk ?? baseline.player.atk) * 1.05)
  ) {
    warnings.push("모든 피해가 마법 공격 축에 한 번만 적용되지 않음");
  }
  if (applied.player.enemyPhysicalDefReductionPct !== 9) {
    warnings.push("물리 관통이 전투 축에 한 번만 적용되지 않음");
  }
  if (applied.player.enemyMagicDefReductionPct !== 9) {
    warnings.push("마법 관통이 전투 축에 한 번만 적용되지 않음");
  }
  if (applied.player.skillCritDmgPct !== 40) {
    warnings.push("스킬 치명타 피해가 전투 축에 한 번만 적용되지 않음");
  }
  if (
    applied.player.passiveDamageTakenReductionPct !==
    stackedDamageReductionPct(6)
  ) {
    warnings.push("받는 피해 감소가 점감 축에 한 번만 적용되지 않음");
  }
  if (applied.player.finalEvasionReductionPctAdd !== 5) {
    warnings.push("최종 회피 효과가 전투 축에 한 번만 적용되지 않음");
  }

  const growth = derivePlayerCombatV2Pure({
    ...baseInput,
    liberationCycleGrowth: { hp: 30, mp: 10 },
  });
  if (growth.maxHp - baseline.maxHp !== 30) {
    warnings.push("해방 HP 성장이 최대 HP 축에 한 번만 적용되지 않음");
  }
  if ((growth.player.maxMp ?? 0) - (baseline.player.maxMp ?? 0) !== 10) {
    warnings.push("해방 MP 성장이 최대 MP 축에 한 번만 적용되지 않음");
  }

  for (const row of combatSummary()) {
    const top = row.settings.topRank1;
    if (top.evasionPct > 75) warnings.push(`${row.jobId}: 표시 회피 상한 우회`);
    if (top.damageTakenReductionPct > 30) {
      warnings.push(`${row.jobId}: 받는 피해 감소 엔진 상한 우회`);
    }
  }
  return warnings;
}

export function simulateEquipmentLiberation({
  seed,
  iterations,
}: {
  seed: number;
  iterations: number;
}): EquipmentLiberationSimulationSummary {
  const normalizedIterations = Math.max(1, Math.floor(iterations));
  const normalizedSeed = Math.floor(seed) >>> 0;
  const rng = seededEquipmentLiberationRandom(normalizedSeed);
  const lineCounts: Record<LiberationLineCount, number> = { 1: 0, 2: 0, 3: 0 };
  const rankLevelCounts: Record<LiberationRank, Record<number, number>> = {
    1: Object.fromEntries(EQUIPMENT_LIBERATION_LEVEL_DISTRIBUTIONS[1].map(([level]) => [level, 0])),
    2: Object.fromEntries(EQUIPMENT_LIBERATION_LEVEL_DISTRIBUTIONS[2].map(([level]) => [level, 0])),
    3: Object.fromEntries(EQUIPMENT_LIBERATION_LEVEL_DISTRIBUTIONS[3].map(([level]) => [level, 0])),
  };
  const rankLevelSamples: Record<LiberationRank, number> = { 1: 0, 2: 0, 3: 0 };
  const firstLineCounts = Object.fromEntries(
    SLOTS.map((slot) => [
      slot,
      Object.fromEntries(EQUIPMENT_LIBERATION_POOLS[slot].map((entry) => [entry.id, 0])),
    ]),
  ) as Record<V2EquipSlot, Partial<Record<LiberationOptionId, number>>>;
  const combinationCounts: Record<LiberationLineCount, CombinationCounts> = {
    1: emptyCombinationCounts(),
    2: emptyCombinationCounts(),
    3: emptyCombinationCounts(),
  };
  const combinationSamples: Record<LiberationLineCount, number> = { 1: 0, 2: 0, 3: 0 };

  for (const slot of SLOTS) {
    for (let index = 0; index < normalizedIterations; index += 1) {
      const result = rollInitialLiberation(slot, rng);
      lineCounts[result.lineCount] += 1;
      const first = result.options[0];
      firstLineCounts[slot][first.id] = (firstLineCounts[slot][first.id] ?? 0) + 1;
      rankLevelCounts[3][first.level] += 1;
      rankLevelSamples[3] += 1;
      if (slot === "weapon") {
        combinationSamples[result.lineCount] += 1;
        recordCombination(combinationCounts[result.lineCount], result.options);
      }
    }
  }

  let rank3To2 = 0;
  let rank2To1 = 0;
  for (let index = 0; index < normalizedIterations; index += 1) {
    const slot = SLOTS[index % SLOTS.length];
    const fromRank3 = rerollLiberation(slot, fixedRankState(slot, 3), rng);
    if (fromRank3.rank === 2) rank3To2 += 1;

    const fromRank2 = rerollLiberation(slot, fixedRankState(slot, 2), rng);
    if (fromRank2.rank === 1) {
      rank2To1 += 1;
    } else {
      rankLevelCounts[2][fromRank2.options[0].level] += 1;
      rankLevelSamples[2] += 1;
    }

    const fromRank1 = rerollLiberation(slot, fixedRankState(slot, 1), rng);
    rankLevelCounts[1][fromRank1.options[0].level] += 1;
    rankLevelSamples[1] += 1;
  }

  const initialLineCounts = Object.fromEntries(
    ([1, 2, 3] as const).map((lineCount) => [
      lineCount,
      probabilityObservation(
        lineCounts[lineCount],
        normalizedIterations * SLOTS.length,
        EQUIPMENT_LIBERATION_LINE_COUNT_PROBABILITIES[lineCount],
      ),
    ]),
  ) as EquipmentLiberationSimulationSummary["initialLineCounts"];

  const rankLevelDistributions = Object.fromEntries(
    ([1, 2, 3] as const).map((rank) => {
      const weights = EQUIPMENT_LIBERATION_LEVEL_DISTRIBUTIONS[rank];
      const totalWeight = weights.reduce((sum, [, weight]) => sum + weight, 0);
      return [
        rank,
        Object.fromEntries(
          weights.map(([level, weight]) => [
            level,
            probabilityObservation(
              rankLevelCounts[rank][level],
              rankLevelSamples[rank],
              weight / totalWeight,
            ),
          ]),
        ),
      ];
    }),
  ) as EquipmentLiberationSimulationSummary["rankLevelDistributions"];

  const firstLineOptions = Object.fromEntries(
    SLOTS.map((slot) => [
      slot,
      Object.fromEntries(
        EQUIPMENT_LIBERATION_POOLS[slot].map((entry) => [
          entry.id,
          probabilityObservation(
            firstLineCounts[slot][entry.id] ?? 0,
            normalizedIterations,
            firstLineProbability(slot, entry.id),
          ),
        ]),
      ),
    ]),
  ) as EquipmentLiberationSimulationSummary["firstLineOptions"];

  const promotion3To2 = probabilityObservation(
    rank3To2,
    normalizedIterations,
    EQUIPMENT_LIBERATION_PROMOTION_PROBABILITIES[3],
  );
  const promotion2To1 = probabilityObservation(
    rank2To1,
    normalizedIterations,
    EQUIPMENT_LIBERATION_PROMOTION_PROBABILITIES[2],
  );
  const averageAttemptsRank3To2 = normalizedIterations / Math.max(1, rank3To2);
  const averageAttemptsRank2To1 = normalizedIterations / Math.max(1, rank2To1);

  const representativeCombinations = Object.fromEntries(
    ([1, 2, 3] as const).map((lineCount) => [
      lineCount,
      Object.fromEntries(
        Object.entries(combinationCounts[lineCount]).map(([key, count]) => [
          key,
          combinationObservation(count, combinationSamples[lineCount]),
        ]),
      ),
    ]),
  ) as EquipmentLiberationSimulationSummary["representativeCombinations"];

  const probabilityWarnings: string[] = [];
  for (const [lineCount, row] of Object.entries(initialLineCounts)) {
    if (!row.passed) probabilityWarnings.push(`${lineCount}줄 비율 허용 오차 초과`);
  }
  if (!promotion3To2.passed) probabilityWarnings.push("해방 3→2 승급률 허용 오차 초과");
  if (!promotion2To1.passed) probabilityWarnings.push("해방 2→1 승급률 허용 오차 초과");
  for (const [rank, rows] of Object.entries(rankLevelDistributions)) {
    for (const [level, row] of Object.entries(rows)) {
      if (!row.passed) probabilityWarnings.push(`해방 ${rank} 레벨 ${level} 비율 허용 오차 초과`);
    }
  }
  for (const [slot, rows] of Object.entries(firstLineOptions)) {
    for (const [id, row] of Object.entries(rows)) {
      if (!row?.passed) probabilityWarnings.push(`${slot} 첫 줄 ${id} 비율 허용 오차 초과`);
    }
  }
  const doubleApplicationWarnings = singleAxisWarnings();
  const combat = combatSummary();

  return {
    seed: normalizedSeed,
    iterations: normalizedIterations,
    sigmaTolerance: SIGMA_TOLERANCE,
    initialLineCounts,
    rankLevelDistributions,
    firstLineOptions,
    promotions: {
      rank3To2: promotion3To2,
      rank2To1: promotion2To1,
      averageAttemptsRank3To2: rounded(averageAttemptsRank3To2, 3),
      averageAttemptsRank2To1: rounded(averageAttemptsRank2To1, 3),
      averageGoldToRank1: Math.round(
        (1 + averageAttemptsRank3To2 + averageAttemptsRank2To1) *
          EQUIPMENT_LIBERATION_GOLD_COST,
      ),
    },
    representativeCombinations,
    combat,
    validation: {
      probabilityWarnings,
      doubleApplicationWarnings,
      warnings: [...probabilityWarnings, ...doubleApplicationWarnings],
    },
  };
}
