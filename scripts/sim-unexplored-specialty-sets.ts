// 미개척지 6T 특화 세트 결정적 PvE 비교.
// 실행: node --import tsx scripts/sim-unexplored-specialty-sets.ts

import type { Monster } from "../src/adventure/data/monsters/types";
import {
  collectUnexploredSetEffects,
  UNEXPLORED_SPECIALTY_SET_IDS,
  type UnexploredSetEffect,
} from "../src/adventure/data/v2/unexploredSpecialtyEquipment";
import {
  V2_EQUIPMENT,
  type V2EquipmentId,
  type V2EquipSlot,
} from "../src/adventure/data/v2/v2Equipment";
import type { V2SkillsState } from "../src/adventure/data/v2/v2Skills";
import {
  initialBattleState,
  type BattleLogEntry,
  type PlayerCombat,
} from "../src/adventure/v2/combat/engine";
import { resolveBattleAtb } from "../src/adventure/v2/combat/engine.atb";
import {
  aggregateV2Equipment,
  collectEquipSignatures,
} from "../src/lib/server/derivePlayerEquipmentV2";

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
  averageObservedEffectiveHp: number;
  activationCount: number;
};

export type SimulationRow = {
  scenario: ScenarioId;
  maxActions: number;
  metrics: SimulationMetrics;
};

export type UnexploredSpecialtySimulationReport = {
  seed: number;
  seedCount: number;
  actionLimit: number;
  rows: SimulationRow[];
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
): PlayerCombat {
  const equipment = aggregateV2Equipment(equipped);
  const maxHp = 8_000 + equipment.hp;
  const maxMp = 2_000 + equipment.mp;
  const signatures = collectEquipSignatures(equipped);
  const unexplored = collectUnexploredSetEffects(equipped);
  return {
    hp: maxHp,
    maxHp,
    mp: maxMp,
    maxMp,
    strStat: 600,
    dexStat: 300,
    vitStat: 300,
    intStat: 100,
    spiStat: 100,
    lukStat: 200,
    allStatTotal: 1_600,
    classTier: 6,
    atk: 1_100 + equipment.atk,
    magicAtk: 600 + equipment.magicAtk,
    def: 300 + equipment.def,
    magicDef: 250 + equipment.magicDef,
    spd: 240 + equipment.spd,
    evasionPct: equipment.eva,
    evaRating: equipment.eva,
    accuracyPct: Math.min(100, 100 + equipment.accuracy),
    accRating: 100 + equipment.accuracy,
    attackCount: 1,
    critChancePct: 20 + equipment.crit,
    critMult: 1.5 + equipment.critMult / 100,
    statusDamageReductionPct: equipment.statusDamageReductionPct,
    ...(signatures.length > 0 ? { equipSignatures: signatures } : {}),
    ...(unexplored.length > 0 ? { unexploredSetEffects: unexplored } : {}),
    ...(equipment.basicAttackDamagePct > 0
      ? { basicAttackDamagePct: equipment.basicAttackDamagePct }
      : {}),
    ...(equipment.extraBasicAttackDamagePct > 0
      ? { extraBasicAttackDamagePct: equipment.extraBasicAttackDamagePct }
      : {}),
    ...(equipment.statusDotDamagePct > 0
      ? { statusDotDamagePct: equipment.statusDotDamagePct }
      : {}),
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

function verifyInertness(): boolean {
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
    const fullPlayer = buildPlayer(full);
    const removedSlot = Object.keys(full)[0] as V2EquipSlot;
    const partial = { ...full };
    delete partial[removedSlot];
    const partialPlayer = buildPlayer(partial);
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

export function runUnexploredSpecialtySetSimulation(options: {
  seed?: number;
  seedCount?: number;
  actionLimit?: number;
} = {}): UnexploredSpecialtySimulationReport {
  const seed = Math.floor(options.seed ?? BASE_SEED);
  const seedCount = Math.max(1, Math.floor(options.seedCount ?? 100));
  const actionLimit = Math.max(1, Math.floor(options.actionLimit ?? 300));
  const originalRandom = Math.random;
  const rows: SimulationRow[] = [];

  try {
    for (const scenario of SCENARIO_IDS) {
      const player = buildPlayer(loadoutForScenario(scenario));
      const actionCounts: number[] = [];
      let wins = 0;
      let directDamage = 0;
      let periodicDamage = 0;
      let receivedDamage = 0;
      let closingShield = 0;
      let observedEffectiveHp = 0;
      let activations = 0;

      for (let trial = 0; trial < seedCount; trial += 1) {
        Math.random = mulberry32(seed + trial);
        const result = resolveBattleAtb(
          // 모든 조합이 같은 4회분 독침 자원으로 시작해 이후 평타 경계를 함께 측정한다.
          { ...player, hp: player.maxHp, mp: 104 },
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
        observedEffectiveHp +=
          trialReceived + result.finalState.playerHp + trialShield;
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
          averageObservedEffectiveHp: observedEffectiveHp / seedCount,
          activationCount: activations,
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
    inertnessPassed: verifyInertness(),
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
    if (!Object.values(row.metrics).every(Number.isFinite)) {
      errors.push(`${row.scenario}: 유한하지 않은 지표`);
    }
    if (row.metrics.activationCount <= 0) {
      errors.push(`${row.scenario}: 의도한 효과 발동 0회`);
    }
  }
  if (!report.inertnessPassed) errors.push("세트 해제 후 효과가 잔존함");

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
  const iron = report.rows.find((row) => row.scenario === "iron_line_3");
  if (iron && baseline.metrics.averageObservedEffectiveHp > 0) {
    const survivalUpliftPct =
      ((iron.metrics.averageObservedEffectiveHp /
        baseline.metrics.averageObservedEffectiveHp) -
        1) *
      100;
    if (survivalUpliftPct >= 50) {
      errors.push(
        `iron_line_3: 관측 유효 HP가 기준보다 ${survivalUpliftPct.toFixed(1)}% 높음`,
      );
    }
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
    "측정: 피해는 엔진 구조화 로그 기준, 평균 보호막은 전투 종료 표본, 관측 유효 HP는 받은 피해+종료 HP+종료 보호막입니다.",
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
        "관측 유효HP": row.metrics.averageObservedEffectiveHp.toFixed(1),
        "발동": row.metrics.activationCount,
        "공격 증감%": baselineAttack > 0
          ? (((totalAttack / baselineAttack) - 1) * 100).toFixed(1)
          : "0.0",
      };
    }),
  );
}

if (process.argv[1]?.endsWith("sim-unexplored-specialty-sets.ts")) {
  const report = runUnexploredSpecialtySetSimulation();
  printReport(report);
  const errors = validateUnexploredSpecialtySetSimulation(report);
  if (errors.length > 0) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  }
}
