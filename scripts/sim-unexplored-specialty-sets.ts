// 미개척지 6T 특화 세트 결정적 PvE 비교.
// 실행: node --import tsx scripts/sim-unexplored-specialty-sets.ts

import { delimiter, resolve } from "node:path";
import { createRequire } from "node:module";
import type { Monster } from "../src/adventure/data/monsters/types";
import {
  UNEXPLORED_SPECIALTY_SET_IDS,
  type UnexploredSetEffect,
} from "../src/adventure/data/v2/unexploredSpecialtyEquipment";
import {
  V2_EQUIPMENT,
  type V2EquipmentId,
  type V2EquipSlot,
} from "../src/adventure/data/v2/v2Equipment";
import {
  V2_SKILLS,
  v2SkillMpCostValue,
  type V2SkillsState,
} from "../src/adventure/data/v2/v2Skills";
import {
  applyPlayerV2SkillCast,
  initialBattleState,
  type BattleState,
  type BattleLogEntry,
  type PlayerCombat,
} from "../src/adventure/v2/combat/engine";
import { resolveBattleAtb } from "../src/adventure/v2/combat/engine.atb";
import { resolveEnemyPhase } from "../src/adventure/v2/combat/engine.enemyPhase";
import { resolvePlayerPhase } from "../src/adventure/v2/combat/engine.playerPhase";
import type { derivePlayerCombatV2Pure as DerivePlayerCombatV2Pure } from "../src/lib/server/derivePlayerCombatV2";

// Next.js가 번들에서 제공하는 server-only marker를 standalone Node 실행에서도 해석한다.
// 초기화 뒤 dynamic import하여 제품의 순수 파생식을 그대로 재사용한다.
const standaloneRequire = createRequire(resolve(process.cwd(), "package.json"));
const stubPath = resolve(process.cwd(), "scripts/server-only-stub");
process.env.NODE_PATH = [stubPath, process.env.NODE_PATH].filter(Boolean).join(delimiter);
const nodeModule = standaloneRequire("node:module") as {
  Module: { _initPaths(): void };
};
nodeModule.Module._initPaths();

async function loadCombatDeriver(): Promise<typeof DerivePlayerCombatV2Pure> {
  const importedModule = await import("../src/lib/server/derivePlayerCombatV2");
  return importedModule.derivePlayerCombatV2Pure;
}

export const SCENARIO_IDS = [
  "existing_t6_baseline",
  "iron_line_3",
  "triad_decay_3",
  "precision_hunt_3",
  "chain_drive_3",
  "crushing_pressure_3",
  "existing_weapon_3_plus_battle_revenge_3",
  "existing_weapon_3_plus_precision_hunt_3",
  "existing_weapon_3_plus_crushing_pressure_3",
] as const;

export type ScenarioId = (typeof SCENARIO_IDS)[number];

export type SimulationMetrics = {
  winRatePct: number;
  medianPlayerActions: number;
  directDamagePerPlayerAction: number;
  periodicDamagePerPlayerAction: number;
  receivedDamagePerPlayerAction: number;
  averageClosingShield: number;
  opportunityCount: number;
  activationCount: number;
  paidDirectSkillCasts: number;
  thirdPaidCastReached: boolean;
};

export type PlayerSnapshot = {
  maxHp: number;
  maxMp: number;
  atk: number;
  magicAtk: number;
  def: number;
  magicDef: number;
  spd: number;
  evasionPct: number;
  evaRating: number;
  accuracyPct: number;
  accRating: number;
  critChancePct: number;
  critMult: number;
  critResistPct: number;
  healMult: number;
  statusDamageReductionPct: number;
  basicAttackDamagePct: number;
  extraBasicAttackDamagePct: number;
  statusDotDamagePct: number;
};

export type SimulationRow = {
  scenario: ScenarioId;
  maxActions: number;
  playerSnapshot: PlayerSnapshot;
  metrics: SimulationMetrics;
};

export type PairedEffectCheck = {
  definition: string;
  opportunities: number;
  activations: number;
  effectResult: number;
  controlResult: number;
  resultDelta: number;
  passed: boolean;
};

export type DefenseStress = {
  definition: string;
  actionLimit: number;
  baselineMedianEnemyActionsSurvived: number;
  ironMedianEnemyActionsSurvived: number;
  baselineMaxEnemyActions: number;
  ironMaxEnemyActions: number;
  baselinePlayerKills: number;
  ironPlayerKills: number;
  survivalUpliftPct: number;
};

export type UnexploredSpecialtySimulationReport = {
  seed: number;
  seedCount: number;
  actionLimit: number;
  rows: SimulationRow[];
  paidDirectSkillMpCost: number;
  initialPaidSkillMp: number;
  defenseStress: DefenseStress;
  pairedEffectChecks: Record<
    | "triad_dot_amplification"
    | "precision_fourth_basic"
    | "chain_extra_basic"
    | "revenge_consume_boost"
    | "colossus_defense_reduction",
    PairedEffectCheck
  >;
  inertnessPassed: boolean;
};

const ALL_SLOTS: readonly V2EquipSlot[] = [
  "weapon",
  "armor",
  "gloves",
  "boots",
  "ring",
  "necklace",
];
const BASE_SEED = 20_260_909;
const EXISTING_SET_ID = "storm_breaker";
const SKILLS: V2SkillsState = {
  learned: ["v2c_rogue_poison"],
  equipped: ["v2c_rogue_poison"],
};
const PAID_DIRECT_SKILL_MP_COST = v2SkillMpCostValue(
  V2_SKILLS.v2c_rogue_poison,
);
const INITIAL_PAID_SKILL_MP = PAID_DIRECT_SKILL_MP_COST * 4;
const ENEMY: Monster = {
  name: "별의 무덤 비교용 거수",
  tags: ["golem"],
  hp: 42_000,
  atk: 1_400,
  def: 520,
  magicDef: 520,
  spd: 245,
  directActionSpd: true,
  accuracy: 70,
  critPct: 12,
  critMult: 1.5,
  statusDamageReductionPct: 10,
  exp: 0,
};

const SCENARIO_SET: Partial<Record<ScenarioId, string>> = {
  iron_line_3: "unexplored_iron_line",
  triad_decay_3: "unexplored_triad_decay",
  precision_hunt_3: "unexplored_precision_hunt",
  chain_drive_3: "unexplored_chain_drive",
  crushing_pressure_3: "unexplored_crushing_pressure",
  existing_weapon_3_plus_battle_revenge_3: "unexplored_battle_revenge",
  existing_weapon_3_plus_precision_hunt_3: "unexplored_precision_hunt",
  existing_weapon_3_plus_crushing_pressure_3: "unexplored_crushing_pressure",
};

const EXPLICIT_THREE_PLUS_THREE = new Set<ScenarioId>([
  "existing_weapon_3_plus_battle_revenge_3",
  "existing_weapon_3_plus_precision_hunt_3",
  "existing_weapon_3_plus_crushing_pressure_3",
]);

function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value |= 0;
    value = (value + 0x6d2b79f5) | 0;
    let mixed = Math.imul(value ^ (value >>> 15), 1 | value);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function equipmentWithTag(
  setId: string,
  slots?: readonly V2EquipSlot[],
): Partial<Record<V2EquipSlot, V2EquipmentId>> {
  const wanted = slots ? new Set(slots) : null;
  const result: Partial<Record<V2EquipSlot, V2EquipmentId>> = {};
  for (const [id, item] of Object.entries(V2_EQUIPMENT) as Array<
    [V2EquipmentId, (typeof V2_EQUIPMENT)[V2EquipmentId]]
  >) {
    if ((wanted && !wanted.has(item.slot)) || !item.setTags?.includes(setId)) continue;
    result[item.slot] ??= id;
  }
  for (const slot of slots ?? []) {
    if (!result[slot]) throw new Error(`${setId} 세트의 ${slot} 장비가 없습니다.`);
  }
  return result;
}

function distinctTier6Fillers(
  occupied: ReadonlySet<V2EquipSlot>,
): Partial<Record<V2EquipSlot, V2EquipmentId>> {
  const result: Partial<Record<V2EquipSlot, V2EquipmentId>> = {};
  const usedTags = new Set<string>();
  for (const slot of ALL_SLOTS) {
    if (occupied.has(slot)) continue;
    const match = (Object.entries(V2_EQUIPMENT) as Array<
      [V2EquipmentId, (typeof V2_EQUIPMENT)[V2EquipmentId]]
    >).find(([, item]) => {
      const tag = item.setTags?.[0];
      return (
        item.slot === slot &&
        item.tier === 16 &&
        item.rarity !== "unique" &&
        !item.id.startsWith("v2_unexplored_") &&
        !!tag &&
        !usedTags.has(tag)
      );
    });
    if (!match) throw new Error(`${slot} 슬롯의 단일 6T 비교 장비가 없습니다.`);
    result[slot] = match[0];
    usedTags.add(match[1].setTags![0]!);
  }
  return result;
}

function loadoutForScenario(
  scenario: ScenarioId,
): Partial<Record<V2EquipSlot, V2EquipmentId>> {
  if (scenario === "existing_t6_baseline") {
    return equipmentWithTag(EXISTING_SET_ID, ALL_SLOTS);
  }
  const setId = SCENARIO_SET[scenario];
  if (!setId) throw new Error(`세트가 지정되지 않은 시나리오: ${scenario}`);
  const specialty = equipmentWithTag(setId);
  const occupied = new Set(Object.keys(specialty) as V2EquipSlot[]);
  const fillers = EXPLICIT_THREE_PLUS_THREE.has(scenario)
    ? equipmentWithTag(
        EXISTING_SET_ID,
        ALL_SLOTS.filter((slot) => !occupied.has(slot)),
      )
    : distinctTier6Fillers(occupied);
  return { ...fillers, ...specialty };
}

function buildPlayer(
  equipped: Partial<Record<V2EquipSlot, V2EquipmentId>>,
  derivePlayerCombatV2Pure: typeof DerivePlayerCombatV2Pure,
): PlayerCombat {
  return derivePlayerCombatV2Pure({
    level: 100,
    allocatedStats: {
      str: 585,
      dex: 285,
      vit: 285,
      int: 85,
      spi: 85,
      luk: 185,
    },
    v2Equipped: equipped,
    classTier: 6,
  }).player;
}

function snapshotPlayer(player: PlayerCombat): PlayerSnapshot {
  return {
    maxHp: player.maxHp,
    maxMp: player.maxMp ?? 0,
    atk: player.atk,
    magicAtk: player.magicAtk ?? 0,
    def: player.def,
    magicDef: player.magicDef ?? 0,
    spd: player.spd,
    evasionPct: player.evasionPct,
    evaRating: player.evaRating ?? 0,
    accuracyPct: player.accuracyPct ?? 0,
    accRating: player.accRating ?? 0,
    critChancePct: player.critChancePct ?? 0,
    critMult: player.critMult ?? 1.5,
    critResistPct: player.critResistPct ?? 0,
    healMult: player.healMult ?? 1,
    statusDamageReductionPct: player.statusDamageReductionPct ?? 0,
    basicAttackDamagePct: player.basicAttackDamagePct ?? 0,
    extraBasicAttackDamagePct: player.extraBasicAttackDamagePct ?? 0,
    statusDotDamagePct: player.statusDotDamagePct ?? 0,
  };
}

function damageFromLog(entry: BattleLogEntry): number {
  if (entry.kind === "hp_bar") return 0;
  const match = entry.text.match(/([0-9][0-9,]*)\s*(?:추가\s*)?피해/);
  return match ? Number(match[1]!.replaceAll(",", "")) : 0;
}

function isPlayerPeriodic(entry: BattleLogEntry): boolean {
  return (
    entry.kind !== "hp_bar" &&
    entry.turn === "enemy" &&
    entry.effect === "status_damage"
  );
}

function activationCount(
  scenario: ScenarioId,
  player: PlayerCombat,
  log: readonly BattleLogEntry[],
  finalState: ReturnType<typeof initialBattleState>,
  playerActions: number,
): number {
  const directEntries = log.filter(
    (entry) =>
      entry.kind === "player_attack" && entry.effect !== "extra_damage",
  );
  const periodicEntries = log.filter(isPlayerPeriodic);
  if (scenario === "iron_line_3") {
    return (finalState.unexploredSetRuntime?.ironWallDefBonus ?? 0) > 0 ? 1 : 0;
  }
  if (scenario === "triad_decay_3") return periodicEntries.length;
  if (
    scenario === "precision_hunt_3" ||
    scenario === "existing_weapon_3_plus_precision_hunt_3"
  ) {
    const skillCasts = log.filter(
      (entry) => entry.kind !== "hp_bar" && entry.skillCast != null,
    ).length;
    const manualBasics = Math.max(0, playerActions - skillCasts);
    return Math.floor(manualBasics / 4);
  }
  if (scenario === "chain_drive_3") {
    // 독침은 단일타이고 플레이어 행동당 본공격 로그가 정확히 하나다.
    // 행동 수를 넘는 player_attack 로그가 같은 행동에 삽입된 연쇄 구동 추가 평타다.
    return Math.max(0, directEntries.length - playerActions);
  }
  if (scenario === "existing_weapon_3_plus_battle_revenge_3") {
    return log.filter(
      (entry) =>
        entry.kind === "enemy_attack" &&
        damageFromLog(entry) >= player.maxHp * 0.05,
    ).length;
  }
  return directEntries.length;
}

function opportunityCount(
  scenario: ScenarioId,
  player: PlayerCombat,
  log: readonly BattleLogEntry[],
  playerActions: number,
): number {
  const directEntries = log.filter(
    (entry) => entry.kind === "player_attack" && entry.effect !== "extra_damage",
  ).length;
  if (scenario === "iron_line_3") {
    return log.filter((entry) => entry.kind === "enemy_attack").length;
  }
  if (scenario === "triad_decay_3") {
    return log.filter(isPlayerPeriodic).length;
  }
  if (
    scenario === "precision_hunt_3" ||
    scenario === "existing_weapon_3_plus_precision_hunt_3"
  ) {
    const skillCasts = log.filter(
      (entry) => entry.kind !== "hp_bar" && entry.skillCast != null,
    ).length;
    return Math.max(0, playerActions - skillCasts);
  }
  if (scenario === "chain_drive_3") {
    return log.filter(
      (entry) => entry.kind !== "hp_bar" && entry.skillCast != null,
    ).length;
  }
  if (scenario === "existing_weapon_3_plus_battle_revenge_3") {
    return log.filter(
      (entry) =>
        entry.kind === "enemy_attack" &&
        damageFromLog(entry) >= player.maxHp * 0.05,
    ).length;
  }
  return directEntries;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : sorted[middle] ?? 0;
}

function hasEffect(
  player: PlayerCombat,
  kind: UnexploredSetEffect["kind"],
): boolean {
  return player.unexploredSetEffects?.some((effect) => effect.kind === kind) ?? false;
}

function verifyInertness(
  derivePlayerCombatV2Pure: typeof DerivePlayerCombatV2Pure,
): boolean {
  const expectedEffects: Partial<
    Record<string, UnexploredSetEffect["kind"]>
  > = {
    unexplored_iron_line: "iron_wall",
    unexplored_battle_revenge: "battle_revenge",
    unexplored_precision_hunt: "precision_shot",
    unexplored_chain_drive: "chain_drive",
    unexplored_crushing_pressure: "colossus_crush",
  };
  for (const setId of UNEXPLORED_SPECIALTY_SET_IDS) {
    const full = equipmentWithTag(setId);
    const fullPlayer = buildPlayer(full, derivePlayerCombatV2Pure);
    const removedSlot = Object.keys(full)[0] as V2EquipSlot;
    const partial = { ...full };
    delete partial[removedSlot];
    const partialPlayer = buildPlayer(partial, derivePlayerCombatV2Pure);
    if (setId === "unexplored_triad_decay") {
      if (fullPlayer.statusDotDamagePct !== 40) return false;
      if (partialPlayer.statusDotDamagePct !== 15) return false;
      continue;
    }
    const expected = expectedEffects[setId];
    if (!expected) continue;
    if (!hasEffect(fullPlayer, expected) || hasEffect(partialPlayer, expected)) {
      return false;
    }
    const state = initialBattleState(partialPlayer, ENEMY, "Sim", SKILLS);
    if (state.unexploredSetRuntime) return false;
  }
  return true;
}

function withoutEffect(
  player: PlayerCombat,
  kind: UnexploredSetEffect["kind"],
): PlayerCombat {
  const remaining = player.unexploredSetEffects?.filter(
    (effect) => effect.kind !== kind,
  );
  return {
    ...player,
    ...(remaining?.length
      ? { unexploredSetEffects: remaining }
      : { unexploredSetEffects: undefined }),
  };
}

function playerDirectDamage(log: readonly BattleLogEntry[]): number {
  return log
    .filter(
      (entry) => entry.kind === "player_attack" && entry.effect !== "extra_damage",
    )
    .reduce((sum, entry) => sum + damageFromLog(entry), 0);
}

function periodicDamage(log: readonly BattleLogEntry[]): number {
  return log
    .filter(isPlayerPeriodic)
    .reduce((sum, entry) => sum + damageFromLog(entry), 0);
}

function runManualBasics(
  player: PlayerCombat,
  count: number,
  enemy: Monster = { ...ENEMY, hp: 1_000_000 },
): BattleState {
  let state = initialBattleState(player, enemy, "Sim", SKILLS);
  for (let index = 0; index < count && state.enemyHp > 0; index += 1) {
    state = resolvePlayerPhase(
      { ...state, phase: "player", playerAttacksLeft: 1 },
      player,
      "Sim",
      { kind: "attack" },
    );
  }
  return state;
}

function runOnePaidSkill(player: PlayerCombat): BattleState {
  const state = initialBattleState(
    { ...player, mp: INITIAL_PAID_SKILL_MP },
    { ...ENEMY, hp: 1_000_000 },
    "Sim",
    SKILLS,
  );
  return applyPlayerV2SkillCast(
    state,
    { ...player, mp: INITIAL_PAID_SKILL_MP },
    {
      selfBuffs: state.v2SelfBuffs,
      selfDebuffs: state.v2SelfDebuffs,
      enemyDebuffs: state.enemyV2Debuffs,
    },
    "Sim",
  ).state;
}

function pairedCheck(
  definition: string,
  opportunities: number,
  activations: number,
  effectResult: number,
  controlResult: number,
): PairedEffectCheck {
  const resultDelta = effectResult - controlResult;
  return {
    definition,
    opportunities,
    activations,
    effectResult,
    controlResult,
    resultDelta,
    passed:
      opportunities >= activations && activations > 0 && resultDelta > 0,
  };
}

function runPairedEffectChecks(
  derivePlayerCombatV2Pure: typeof DerivePlayerCombatV2Pure,
  seed: number,
): UnexploredSpecialtySimulationReport["pairedEffectChecks"] {
  const originalRandom = Math.random;
  try {
    const triad = buildPlayer(
      loadoutForScenario("triad_decay_3"),
      derivePlayerCombatV2Pure,
    );
    const triadControl = { ...triad, statusDotDamagePct: 15 };
    const runTriad = (player: PlayerCombat) => {
      Math.random = mulberry32(seed);
      return resolveBattleAtb(
        { ...player, hp: player.maxHp, mp: INITIAL_PAID_SKILL_MP },
        { ...ENEMY, hp: 1_000_000, atk: 1 },
        "Sim",
        {
          pickAction: () => ({ kind: "attack" }),
          potions: {},
          v2Skills: SKILLS,
          forceAtbSkills: true,
          maxTurns: 12,
          depth: 84,
        },
      ).finalState;
    };
    const triadEffectState = runTriad(triad);
    const triadControlState = runTriad(triadControl);
    const triadEffectTicks = triadEffectState.log.filter(isPlayerPeriodic).length;

    const precision = buildPlayer(
      loadoutForScenario("precision_hunt_3"),
      derivePlayerCombatV2Pure,
    );
    Math.random = mulberry32(seed + 1);
    const precisionState = runManualBasics(precision, 4);
    Math.random = mulberry32(seed + 1);
    const precisionControlState = runManualBasics(
      withoutEffect(precision, "precision_shot"),
      4,
    );
    const precisionConsumed =
      precisionState.unexploredSetRuntime?.manualBasicAttackCount === 0;

    const chain = buildPlayer(
      loadoutForScenario("chain_drive_3"),
      derivePlayerCombatV2Pure,
    );
    Math.random = () => 0;
    const chainState = runOnePaidSkill(chain);
    Math.random = () => 0;
    const chainControlState = runOnePaidSkill(
      withoutEffect(chain, "chain_drive"),
    );
    const chainExtraEntries = Math.max(
      0,
      chainState.log.filter((entry) => entry.kind === "player_attack").length -
        chainControlState.log.filter((entry) => entry.kind === "player_attack").length,
    );

    const revenge = buildPlayer(
      loadoutForScenario("existing_weapon_3_plus_battle_revenge_3"),
      derivePlayerCombatV2Pure,
    );
    const revengeEnemy: Monster = {
      ...ENEMY,
      hp: 1_000_000,
      atk: revenge.maxHp,
      critPct: 0,
    };
    const runRevenge = (player: PlayerCombat) => {
      Math.random = mulberry32(seed + 2);
      let state = initialBattleState(player, revengeEnemy, "Sim", SKILLS);
      state = resolveEnemyPhase(
        {
          ...state,
          phase: "enemy",
          turn: { ...state.turn, enemyAttacksLeft: 1 },
        },
        player,
        "Sim",
        true,
      );
      const queued = state.unexploredSetRuntime?.revengePending === true;
      state = resolvePlayerPhase(
        { ...state, phase: "player", playerAttacksLeft: 1 },
        player,
        "Sim",
        { kind: "attack" },
      );
      return {
        state,
        queued,
        consumed:
          queued && state.unexploredSetRuntime?.revengePending === false,
      };
    };
    const revengeEffect = runRevenge(revenge);
    const revengeControl = runRevenge(withoutEffect(revenge, "battle_revenge"));

    const colossus = buildPlayer(
      loadoutForScenario("crushing_pressure_3"),
      derivePlayerCombatV2Pure,
    );
    const highDefenseEnemy = { ...ENEMY, hp: 1_000_000, def: 800 };
    Math.random = mulberry32(seed + 3);
    const colossusState = runManualBasics(colossus, 1, highDefenseEnemy);
    Math.random = mulberry32(seed + 3);
    const colossusControlState = runManualBasics(
      withoutEffect(colossus, "colossus_crush"),
      1,
      highDefenseEnemy,
    );

    return {
      triad_dot_amplification: pairedCheck(
        "동일 장비에서 3세트 DOT +25%만 제거한 주기 피해",
        triadEffectTicks,
        triadEffectTicks,
        periodicDamage(triadEffectState.log),
        periodicDamage(triadControlState.log),
      ),
      precision_fourth_basic: pairedCheck(
        "동일 장비에서 정밀 사격을 제거한 4번째 수동 평타 피해",
        4,
        precisionConsumed ? 1 : 0,
        playerDirectDamage(precisionState.log),
        playerDirectDamage(precisionControlState.log),
      ),
      chain_extra_basic: pairedCheck(
        "동일 장비에서 연쇄 구동을 제거한 직접 스킬 후 생성 평타 피해",
        1,
        chainExtraEntries,
        playerDirectDamage(chainState.log),
        playerDirectDamage(chainControlState.log),
      ),
      revenge_consume_boost: pairedCheck(
        "실제 큰 피격으로 예약·소비한 응징의 다음 직접 공격 피해",
        revengeEffect.queued ? 1 : 0,
        revengeEffect.consumed ? 1 : 0,
        playerDirectDamage(revengeEffect.state.log),
        playerDirectDamage(revengeControl.state.log),
      ),
      colossus_defense_reduction: pairedCheck(
        "동일 고방어 적에서 거수 파쇄를 제거한 직접 공격 피해",
        1,
        1,
        playerDirectDamage(colossusState.log),
        playerDirectDamage(colossusControlState.log),
      ),
    };
  } finally {
    Math.random = originalRandom;
  }
}

function runDefenseStress(
  derivePlayerCombatV2Pure: typeof DerivePlayerCombatV2Pure,
  seed: number,
  seedCount: number,
  actionLimit: number,
): DefenseStress {
  const originalRandom = Math.random;
  const stressEnemy: Monster = {
    ...ENEMY,
    name: "방어 스트레스 통제 거수",
    hp: 1_000_000_000,
    atk: 2_800,
    def: 1_000_000_000,
    magicDef: 1_000_000_000,
    spd: 180,
    critPct: 0,
  };
  const prepare = (player: PlayerCombat): PlayerCombat => ({
    ...player,
    hp: player.maxHp,
    mp: 0,
    atk: 1,
    magicAtk: 1,
    critChancePct: 0,
    extraAttackChancePct: 0,
    basicAttackDamagePct: 0,
    extraBasicAttackDamagePct: 0,
    statusDotDamagePct: 0,
    equipSignatures: undefined,
  });
  const run = (scenario: "existing_t6_baseline" | "iron_line_3") => {
    const player = prepare(
      buildPlayer(loadoutForScenario(scenario), derivePlayerCombatV2Pure),
    );
    const survived: number[] = [];
    let playerKills = 0;
    try {
      for (let trial = 0; trial < seedCount; trial += 1) {
        Math.random = mulberry32(seed + trial);
        const result = resolveBattleAtb(player, stressEnemy, "Sim", {
          pickAction: () => ({ kind: "attack" }),
          potions: {},
          v2Skills: { learned: [], equipped: [] },
          forceAtbSkills: true,
          maxTurns: actionLimit,
          depth: 84,
        });
        playerKills += result.outcome === "win" ? 1 : 0;
        survived.push(
          result.finalState.log.filter(
            (entry) => entry.kind === "enemy_attack",
          ).length,
        );
      }
    } finally {
      Math.random = originalRandom;
    }
    return { survived, playerKills };
  };
  const baseline = run("existing_t6_baseline");
  const iron = run("iron_line_3");
  const baselineMedian = median(baseline.survived);
  const ironMedian = median(iron.survived);
  return {
    definition:
      "동일 고HP·고방어 적의 동일 공격 압력에서 사망 또는 상한까지 생존한 적 행동 수(치명타 없음, 플레이어 선처치 불가)",
    actionLimit,
    baselineMedianEnemyActionsSurvived: baselineMedian,
    ironMedianEnemyActionsSurvived: ironMedian,
    baselineMaxEnemyActions: Math.max(...baseline.survived),
    ironMaxEnemyActions: Math.max(...iron.survived),
    baselinePlayerKills: baseline.playerKills,
    ironPlayerKills: iron.playerKills,
    survivalUpliftPct:
      baselineMedian > 0 ? ((ironMedian / baselineMedian) - 1) * 100 : 0,
  };
}

export async function runUnexploredSpecialtySetSimulation(options: {
  seed?: number;
  seedCount?: number;
  actionLimit?: number;
} = {}): Promise<UnexploredSpecialtySimulationReport> {
  const derivePlayerCombatV2Pure = await loadCombatDeriver();
  const seed = Math.floor(options.seed ?? BASE_SEED);
  const seedCount = Math.max(1, Math.floor(options.seedCount ?? 100));
  const actionLimit = Math.max(1, Math.floor(options.actionLimit ?? 300));
  const originalRandom = Math.random;
  const rows: SimulationRow[] = [];

  try {
    for (const scenario of SCENARIO_IDS) {
      const player = buildPlayer(
        loadoutForScenario(scenario),
        derivePlayerCombatV2Pure,
      );
      const actionCounts: number[] = [];
      let wins = 0;
      let directDamage = 0;
      let periodicDamage = 0;
      let receivedDamage = 0;
      let closingShield = 0;
      let opportunities = 0;
      let activations = 0;
      let paidDirectSkillCasts = 0;

      for (let trial = 0; trial < seedCount; trial += 1) {
        Math.random = mulberry32(seed + trial);
        const result = resolveBattleAtb(
          // 모든 조합이 같은 4회분 독침 자원으로 시작해 이후 평타 경계를 함께 측정한다.
          { ...player, hp: player.maxHp, mp: INITIAL_PAID_SKILL_MP },
          ENEMY,
          "Sim",
          {
            pickAction: () => ({ kind: "attack" }),
            potions: {},
            v2Skills: SKILLS,
            forceAtbSkills: true,
            maxTurns: actionLimit,
            depth: 84,
          },
        );
        const log = result.finalState.log;
        const trialDirect = log
          .filter(
            (entry) =>
              entry.kind === "player_attack" &&
              entry.effect !== "extra_damage",
          )
          .reduce((sum, entry) => sum + damageFromLog(entry), 0);
        const trialPeriodic = log
          .filter(isPlayerPeriodic)
          .reduce((sum, entry) => sum + damageFromLog(entry), 0);
        const trialReceived = log
          .filter(
            (entry) =>
              entry.kind === "enemy_attack" ||
              (entry.kind !== "hp_bar" &&
                entry.turn === "player" &&
                entry.effect === "status_damage"),
          )
          .reduce((sum, entry) => sum + damageFromLog(entry), 0);
        const trialShield = result.finalState.stacks.playerShield;
        wins += result.outcome === "win" ? 1 : 0;
        actionCounts.push(result.turns);
        directDamage += trialDirect;
        periodicDamage += trialPeriodic;
        receivedDamage += trialReceived;
        closingShield += trialShield;
        const trialPaidCasts = log.filter(
          (entry) =>
            entry.kind !== "hp_bar" &&
            entry.skillCast?.skillId === "v2c_rogue_poison",
        ).length;
        paidDirectSkillCasts += trialPaidCasts;
        opportunities += opportunityCount(
          scenario,
          player,
          log,
          result.turns,
        );
        activations += activationCount(
          scenario,
          player,
          log,
          result.finalState,
          result.turns,
        );
      }

      const totalActions = actionCounts.reduce((sum, value) => sum + value, 0);
      rows.push({
        scenario,
        maxActions: Math.max(...actionCounts),
        playerSnapshot: snapshotPlayer(player),
        metrics: {
          winRatePct: (wins / seedCount) * 100,
          medianPlayerActions: median(actionCounts),
          directDamagePerPlayerAction:
            totalActions > 0 ? directDamage / totalActions : 0,
          periodicDamagePerPlayerAction:
            totalActions > 0 ? periodicDamage / totalActions : 0,
          receivedDamagePerPlayerAction:
            totalActions > 0 ? receivedDamage / totalActions : 0,
          averageClosingShield: closingShield / seedCount,
          opportunityCount: opportunities,
          activationCount: activations,
          paidDirectSkillCasts: paidDirectSkillCasts / seedCount,
          thirdPaidCastReached: paidDirectSkillCasts >= seedCount * 3,
        },
      });
    }
  } finally {
    Math.random = originalRandom;
  }

  return {
    seed,
    seedCount,
    actionLimit,
    rows,
    paidDirectSkillMpCost: PAID_DIRECT_SKILL_MP_COST,
    initialPaidSkillMp: INITIAL_PAID_SKILL_MP,
    defenseStress: runDefenseStress(
      derivePlayerCombatV2Pure,
      seed,
      seedCount,
      actionLimit,
    ),
    pairedEffectChecks: runPairedEffectChecks(
      derivePlayerCombatV2Pure,
      seed,
    ),
    inertnessPassed: verifyInertness(derivePlayerCombatV2Pure),
  };
}

export function validateUnexploredSpecialtySetSimulation(
  report: UnexploredSpecialtySimulationReport,
): string[] {
  const errors: string[] = [];
  for (const row of report.rows) {
    if (row.maxActions > report.actionLimit) {
      errors.push(`${row.scenario}: ${row.maxActions}행동으로 상한 초과`);
    }
    if (
      !Object.values(row.metrics)
        .filter((value): value is number => typeof value === "number")
        .every(Number.isFinite)
    ) {
      errors.push(`${row.scenario}: 유한하지 않은 지표`);
    }
    if (row.metrics.activationCount <= 0) {
      errors.push(`${row.scenario}: 의도한 효과 발동 0회`);
    }
  }
  if (!report.inertnessPassed) errors.push("세트 해제 후 효과가 잔존함");
  for (const [name, check] of Object.entries(report.pairedEffectChecks)) {
    const finite = [
      check.opportunities,
      check.activations,
      check.effectResult,
      check.controlResult,
      check.resultDelta,
    ].every(Number.isFinite);
    if (
      !finite ||
      !check.passed ||
      check.activations <= 0 ||
      check.resultDelta <= 0 ||
      check.opportunities < check.activations
    ) {
      errors.push(`${name}: 제거 대조군과 실제 효과 차이 없음`);
    }
  }
  if (
    report.paidDirectSkillMpCost <= 0 ||
    report.initialPaidSkillMp < report.paidDirectSkillMpCost * 4 ||
    report.rows.some(
      (row) =>
        row.metrics.paidDirectSkillCasts < 4 ||
        !row.metrics.thirdPaidCastReached,
    )
  ) {
    errors.push("공통 유료 직접 스킬 4회 또는 3번째 시전 미도달");
  }
  const stressNumbers = Object.values(report.defenseStress).filter(
    (value): value is number => typeof value === "number",
  );
  if (
    !stressNumbers.every(Number.isFinite) ||
    report.defenseStress.baselineMedianEnemyActionsSurvived <= 0 ||
    report.defenseStress.ironMedianEnemyActionsSurvived <= 0 ||
    report.defenseStress.baselineMaxEnemyActions >
      report.defenseStress.actionLimit ||
    report.defenseStress.ironMaxEnemyActions >
      report.defenseStress.actionLimit ||
    report.defenseStress.baselinePlayerKills !== 0 ||
    report.defenseStress.ironPlayerKills !== 0
  ) {
    errors.push("방어 스트레스 지표가 유한하지 않거나 상한을 초과함");
  }

  const baseline = report.rows.find(
    (row) => row.scenario === "existing_t6_baseline",
  );
  if (!baseline) return [...errors, "existing_t6_baseline 누락"];
  const baselineAttack =
    baseline.metrics.directDamagePerPlayerAction +
    baseline.metrics.periodicDamagePerPlayerAction;
  for (const row of report.rows) {
    if (row.scenario === baseline.scenario) continue;
    const attack =
      row.metrics.directDamagePerPlayerAction +
      row.metrics.periodicDamagePerPlayerAction;
    const attackUpliftPct =
      baselineAttack > 0 ? ((attack / baselineAttack) - 1) * 100 : 0;
    if (attackUpliftPct >= 35) {
      errors.push(
        `${row.scenario}: 행동당 공격 피해가 기준보다 ${attackUpliftPct.toFixed(1)}% 높음`,
      );
    }
  }
  if (report.defenseStress.survivalUpliftPct >= 50) {
    errors.push(
      `iron_line_3: 통제 방어 스트레스 생존 적 행동 수가 기준보다 ${report.defenseStress.survivalUpliftPct.toFixed(1)}% 높음`,
    );
  }
  return errors;
}

function printReport(report: UnexploredSpecialtySimulationReport): void {
  const baseline = report.rows[0]!;
  const baselineAttack =
    baseline.metrics.directDamagePerPlayerAction +
    baseline.metrics.periodicDamagePerPlayerAction;
  console.log(
    `미개척지 특화 세트 PvE sim — seed=${report.seed}, seeds=${report.seedCount}, player-action cap=${report.actionLimit}`,
  );
  console.log(
    "측정: 9개 행은 전체 장비 빌드 비교입니다. 피해는 엔진 구조화 로그 기준이며 발동과 기회를 분리했습니다.",
  );
  console.table(
    report.rows.map((row) => {
      const totalAttack =
        row.metrics.directDamagePerPlayerAction +
        row.metrics.periodicDamagePerPlayerAction;
      return {
        scenario: row.scenario,
        "승률%": row.metrics.winRatePct.toFixed(1),
        "중앙 행동": row.metrics.medianPlayerActions.toFixed(1),
        "직접/행동": row.metrics.directDamagePerPlayerAction.toFixed(1),
        "주기/행동": row.metrics.periodicDamagePerPlayerAction.toFixed(1),
        "받피/행동": row.metrics.receivedDamagePerPlayerAction.toFixed(1),
        "평균 종료 보호막": row.metrics.averageClosingShield.toFixed(1),
        "기회": row.metrics.opportunityCount,
        "발동": row.metrics.activationCount,
        "실제 유료시전": row.metrics.paidDirectSkillCasts.toFixed(1),
        "전체빌드 공격 증감%": baselineAttack > 0
          ? (((totalAttack / baselineAttack) - 1) * 100).toFixed(1)
          : "0.0",
      };
    }),
  );
  console.log(`유료 직접 스킬 MP: ${report.paidDirectSkillMpCost} × 4 = ${report.initialPaidSkillMp}`);
  console.log(report.defenseStress.definition);
  console.table({
    existing_t6_baseline: {
      "중앙 생존 적 행동": report.defenseStress.baselineMedianEnemyActionsSurvived,
      "최대 적 행동": report.defenseStress.baselineMaxEnemyActions,
      "플레이어 선처치": report.defenseStress.baselinePlayerKills,
    },
    iron_line_3: {
      "중앙 생존 적 행동": report.defenseStress.ironMedianEnemyActionsSurvived,
      "최대 적 행동": report.defenseStress.ironMaxEnemyActions,
      "플레이어 선처치": report.defenseStress.ironPlayerKills,
    },
  });
  console.table(
    Object.entries(report.pairedEffectChecks).map(([effect, check]) => ({
      effect,
      definition: check.definition,
      opportunities: check.opportunities,
      activations: check.activations,
      effectResult: check.effectResult,
      controlResult: check.controlResult,
      resultDelta: check.resultDelta,
      passed: check.passed,
    })),
  );
}

if (process.argv[1]?.endsWith("sim-unexplored-specialty-sets.ts")) {
  void runUnexploredSpecialtySetSimulation().then((report) => {
    printReport(report);
    const errors = validateUnexploredSpecialtySetSimulation(report);
    if (errors.length > 0) {
      console.error(errors.join("\n"));
      process.exitCode = 1;
    }
  });
}
