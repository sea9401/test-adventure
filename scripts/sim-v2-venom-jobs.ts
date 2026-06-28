// 독술 계보 밸런스 스팟 sim.
// 실행: node --import tsx scripts/sim-v2-venom-jobs.ts

import { resolveBattle, type PlayerCombat } from "../src/adventure/v2/combat/engine";
import { pickAutoAction } from "../src/adventure/v2/combat/pickAutoAction";
import {
  aggregateEquippedPassives,
  emptyV2SkillsState,
  type V2SkillId,
  type V2SkillsState,
} from "../src/adventure/data/v2/v2Skills";
import { V2_SKILLS_BY_JOB } from "../src/adventure/data/v2/v2SkillsByJob";
import { V2_JOB_CATALOG } from "../src/adventure/data/v2/v2JobCatalog";
import { V2_STAT_POINTS_PER_LEVEL } from "../src/adventure/data/v2/v2Stats";
import type { V2StatKey } from "../src/adventure/data/v2/v2StatKeys";
import type { V2Class } from "../src/adventure/data/v2/classes";
import {
  V2_MONSTERS,
} from "../src/adventure/data/v2/v2Monsters";
import { enemiesForDepth } from "../src/adventure/data/v2/dungeon";
import { scaleMonsterForFloor } from "../src/adventure/data/v2/monsterScale";
import { derivePlayerCombatV2Pure } from "../src/lib/server/derivePlayerCombatV2";
import type { Monster } from "../src/adventure/data/monsters/types";

type Case = {
  jobId: string;
  label: string;
  level: number;
  classTier: 2 | 3 | 4;
  main: "dex" | "luk";
  skills: readonly V2SkillId[];
};

const TRIALS_PER_MONSTER = 40;
const DEPTHS = [8, 20, 50];

const CASES: Case[] = [
  {
    jobId: "assassin",
    label: "2차 자객",
    level: 50,
    classTier: 2,
    main: "luk",
    skills: V2_SKILLS_BY_JOB.assassin,
  },
  {
    jobId: "archer",
    label: "2차 궁수",
    level: 50,
    classTier: 2,
    main: "dex",
    skills: V2_SKILLS_BY_JOB.archer,
  },
  {
    jobId: "venomist",
    label: "2차 독술사",
    level: 50,
    classTier: 2,
    main: "luk",
    skills: [...V2_SKILLS_BY_JOB.venomist, "v2c_rogue_poison"],
  },
  {
    jobId: "shadow",
    label: "3차 그림자",
    level: 75,
    classTier: 3,
    main: "luk",
    skills: V2_SKILLS_BY_JOB.shadow,
  },
  {
    jobId: "ranger",
    label: "3차 궁사",
    level: 75,
    classTier: 3,
    main: "dex",
    skills: V2_SKILLS_BY_JOB.ranger,
  },
  {
    jobId: "venomancer",
    label: "3차 맹독술사",
    level: 75,
    classTier: 3,
    main: "luk",
    skills: [
      ...V2_SKILLS_BY_JOB.venomancer,
      ...V2_SKILLS_BY_JOB.venomist,
      "v2c_rogue_poison",
    ],
  },
  {
    jobId: "phantom",
    label: "4차 암살자",
    level: 100,
    classTier: 4,
    main: "luk",
    skills: V2_SKILLS_BY_JOB.phantom,
  },
  {
    jobId: "chief",
    label: "4차 신궁",
    level: 100,
    classTier: 4,
    main: "dex",
    skills: V2_SKILLS_BY_JOB.chief,
  },
  {
    jobId: "venomlord",
    label: "4차 독왕",
    level: 100,
    classTier: 4,
    main: "luk",
    skills: [
      ...V2_SKILLS_BY_JOB.venomlord,
      ...V2_SKILLS_BY_JOB.venomancer,
      ...V2_SKILLS_BY_JOB.venomist,
      "v2c_rogue_poison",
    ],
  },
];

function allocate(level: number, main: "dex" | "luk"): Partial<Record<V2StatKey, number>> {
  const total = Math.max(0, level - 1) * V2_STAT_POINTS_PER_LEVEL;
  if (main === "dex") {
    return {
      dex: Math.round(total * 0.6),
      luk: Math.round(total * 0.3),
      vit: Math.round(total * 0.1),
    };
  }
  return {
    luk: Math.round(total * 0.6),
    dex: Math.round(total * 0.3),
    vit: Math.round(total * 0.1),
  };
}

function skillsState(ids: readonly V2SkillId[]): V2SkillsState {
  return { ...emptyV2SkillsState(), learned: [...ids], equipped: [...ids] };
}

function depthMonsters(depth: number): Monster[] {
  const out: Monster[] = [];
  for (const e of enemiesForDepth(depth)) {
    const base = V2_MONSTERS[e.key];
    if (base) out.push(scaleMonsterForFloor(base, depth));
  }
  return out;
}

function build(c: Case): PlayerCombat {
  const passive = aggregateEquippedPassives(c.skills);
  const d = derivePlayerCombatV2Pure({
    level: c.level,
    allocatedStats: allocate(c.level, c.main),
    v2Equipped: {},
    playerClass: "rogue" satisfies V2Class,
    classTier: c.classTier,
    jobBonus: V2_JOB_CATALOG[c.jobId].jobBonus,
    statPct: passive.statPct,
    maxHpPct: passive.maxHpPct,
    maxMpPct: passive.maxMpPct,
    atkPerDexCoef: passive.atkPerDexCoef,
    passiveCritPct: passive.critPct,
    passiveCritDmgPct: passive.critDmgPct,
    passiveEvasionPct: passive.evasionPct,
    passiveLifestealPct: passive.lifestealPct,
    passiveCounterChancePct: passive.counterChancePct,
    passiveDefPct: passive.defPct,
    passiveThornsDefPct: passive.thornsDefPct,
    passiveAccuracyPct: passive.accuracyPct,
    passiveHealPowerPct: passive.healPowerPct,
    passiveDamageTakenReductionPct: passive.damageTakenReductionPct,
    passiveElementAdvPctBonus: passive.elementAdvPctBonus,
    passiveElementDisPctBonus: passive.elementDisPctBonus,
    passivePoisonedEnemyDefReductionPct: passive.poisonedEnemyDefReductionPct,
  });
  return d.player;
}

function runCell(c: Case, depth: number) {
  const player = build(c);
  const monsters = depthMonsters(depth);
  const state = skillsState(c.skills);
  let wins = 0;
  let total = 0;
  let winTurns = 0;
  let losses = 0;
  let lossEnemyHpPct = 0;
  for (const enemy of monsters) {
    for (let i = 0; i < TRIALS_PER_MONSTER; i += 1) {
      const r = resolveBattle({ ...player, hp: player.maxHp, mp: player.maxMp }, enemy, "Sim", {
        pickAction: (s) => pickAutoAction(s, { rules: [], potions: {} }),
        potions: {},
        v2Skills: state,
        depth,
      });
      total += 1;
      if (r.outcome === "win") {
        wins += 1;
        winTurns += r.turns;
      } else {
        losses += 1;
        lossEnemyHpPct += (r.finalState.enemyHp / enemy.hp) * 100;
      }
    }
  }
  return {
    wr: (wins / total) * 100,
    winTurns: wins ? winTurns / wins : 0,
    lossEnemyHpPct: losses ? lossEnemyHpPct / losses : 0,
    player,
  };
}

console.log(
  `독술 계보 스팟 sim — TRIALS=${TRIALS_PER_MONSTER}/monster, depth=${DEPTHS.join(",")}`,
);
for (const depth of DEPTHS) {
  console.log(`\ndepth ${depth}`);
  for (const c of CASES) {
    const r = runCell(c, depth);
    console.log(
      `${c.label.padEnd(10)} Lv${String(c.level).padStart(3)} ` +
        `wr=${r.wr.toFixed(1).padStart(5)}% ` +
        `winT=${r.winTurns.toFixed(1).padStart(5)} ` +
        `lossHp=${r.lossEnemyHpPct.toFixed(1).padStart(5)}% ` +
        `atk=${String(r.player.atk).padStart(4)} ` +
        `def=${String(r.player.def).padStart(4)} ` +
        `hp=${String(r.player.maxHp).padStart(5)} ` +
        `poisonDef-=${r.player.poisonedEnemyDefReductionPct ?? 0}%`,
    );
  }
}
