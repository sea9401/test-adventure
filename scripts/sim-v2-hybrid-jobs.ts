// 신규 하이브리드/고차 직업 밸런스 스팟 sim.
// 실행: node --import tsx scripts/sim-v2-hybrid-jobs.ts

import { V2_JOB_CATALOG } from "../src/adventure/data/v2/v2JobCatalog";
import {
  aggregateEquippedPassives,
  emptyV2SkillsState,
  type V2SkillId,
  type V2SkillsState,
} from "../src/adventure/data/v2/v2Skills";
import { V2_SKILLS_BY_JOB } from "../src/adventure/data/v2/v2SkillsByJob";
import { V2_STAT_POINTS_PER_LEVEL } from "../src/adventure/data/v2/v2Stats";
import type { V2StatKey } from "../src/adventure/data/v2/v2StatKeys";
import { enemiesForDepth } from "../src/adventure/data/v2/dungeon";
import { V2_MONSTERS } from "../src/adventure/data/v2/v2Monsters";
import { scaleMonsterForFloor } from "../src/adventure/data/v2/monsterScale";
import type { Monster } from "../src/adventure/data/monsters/types";
import { resolveBattle, type PlayerCombat } from "../src/adventure/v2/combat/engine";
import { pickAutoAction } from "../src/adventure/v2/combat/pickAutoAction";
import { derivePlayerCombatV2Pure } from "../src/lib/server/derivePlayerCombatV2";

type Case = {
  jobId: string;
  label: string;
  classId: "warrior" | "mage" | "rogue";
  level: number;
  classTier: 3;
  alloc: Partial<Record<V2StatKey, number>>;
  skills: readonly V2SkillId[];
};

const TRIALS_PER_MONSTER = 60;
const DEPTHS = [7, 12, 20, 30];

function alloc(level: number, weights: Partial<Record<V2StatKey, number>>) {
  const total = Math.max(0, level - 1) * V2_STAT_POINTS_PER_LEVEL;
  const sum = Object.values(weights).reduce((s, v) => s + (v ?? 0), 0);
  const out: Partial<Record<V2StatKey, number>> = {};
  for (const [k, v] of Object.entries(weights)) {
    out[k as V2StatKey] = Math.round(total * ((v ?? 0) / sum));
  }
  return out;
}

const LEVEL = 75;
const CASES: Case[] = [
  {
    jobId: "paladin",
    label: "기사",
    classId: "warrior",
    level: LEVEL,
    classTier: 3,
    alloc: alloc(LEVEL, { str: 0.55, vit: 0.25, dex: 0.2 }),
    skills: [...V2_SKILLS_BY_JOB.paladin, ...V2_SKILLS_BY_JOB.squire],
  },
  {
    jobId: "templar",
    label: "성기사",
    classId: "warrior",
    level: LEVEL,
    classTier: 3,
    alloc: alloc(LEVEL, { str: 0.45, vit: 0.25, spi: 0.3 }),
    skills: [...V2_SKILLS_BY_JOB.templar, ...V2_SKILLS_BY_JOB.paladin, ...V2_SKILLS_BY_JOB.acolyte],
  },
  {
    jobId: "spellblade",
    label: "마검사",
    classId: "warrior",
    level: LEVEL,
    classTier: 3,
    alloc: alloc(LEVEL, { str: 0.45, int: 0.45, vit: 0.1 }),
    skills: [...V2_SKILLS_BY_JOB.spellblade, ...V2_SKILLS_BY_JOB.paladin, ...V2_SKILLS_BY_JOB.magus],
  },
  {
    jobId: "berserker",
    label: "광전사",
    classId: "warrior",
    level: LEVEL,
    classTier: 3,
    alloc: alloc(LEVEL, { str: 0.65, vit: 0.25, luk: 0.1 }),
    skills: [...V2_SKILLS_BY_JOB.berserker, ...V2_SKILLS_BY_JOB.squire],
  },
  {
    jobId: "bloodtemplar",
    label: "혈성기사",
    classId: "warrior",
    level: LEVEL,
    classTier: 3,
    alloc: alloc(LEVEL, { str: 0.5, vit: 0.25, spi: 0.25 }),
    skills: [
      ...V2_SKILLS_BY_JOB.bloodtemplar,
      ...V2_SKILLS_BY_JOB.berserker,
      ...V2_SKILLS_BY_JOB.acolyte,
    ],
  },
  {
    jobId: "bloodtemplar",
    label: "혈성(고유)",
    classId: "warrior",
    level: LEVEL,
    classTier: 3,
    alloc: alloc(LEVEL, { str: 0.5, vit: 0.25, spi: 0.25 }),
    skills: V2_SKILLS_BY_JOB.bloodtemplar,
  },
  {
    jobId: "shadow",
    label: "그림자",
    classId: "rogue",
    level: LEVEL,
    classTier: 3,
    alloc: alloc(LEVEL, { luk: 0.6, dex: 0.3, vit: 0.1 }),
    skills: [...V2_SKILLS_BY_JOB.shadow, ...V2_SKILLS_BY_JOB.assassin],
  },
  {
    jobId: "bishop",
    label: "대사제",
    classId: "mage",
    level: LEVEL,
    classTier: 3,
    alloc: alloc(LEVEL, { spi: 0.45, int: 0.35, vit: 0.2 }),
    skills: [...V2_SKILLS_BY_JOB.bishop, ...V2_SKILLS_BY_JOB.acolyte],
  },
  {
    jobId: "darkpriest",
    label: "암흑사제",
    classId: "rogue",
    level: LEVEL,
    classTier: 3,
    alloc: alloc(LEVEL, { luk: 0.5, spi: 0.25, int: 0.15, vit: 0.1 }),
    skills: [
      ...V2_SKILLS_BY_JOB.darkpriest,
      ...V2_SKILLS_BY_JOB.shadow,
      ...V2_SKILLS_BY_JOB.acolyte,
    ],
  },
  {
    jobId: "darkpriest",
    label: "암흑(고유)",
    classId: "rogue",
    level: LEVEL,
    classTier: 3,
    alloc: alloc(LEVEL, { luk: 0.5, spi: 0.25, int: 0.15, vit: 0.1 }),
    skills: V2_SKILLS_BY_JOB.darkpriest,
  },
];

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
  return derivePlayerCombatV2Pure({
    level: c.level,
    allocatedStats: c.alloc,
    v2Equipped: {},
    playerClass: c.classId,
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
    passiveBerserkAtkPctPerLostHpPct: passive.berserkAtkPctPerLostHpPct,
    passiveEnemyMagicVulnPctPerStack: passive.enemyMagicVulnPctPerStack,
  }).player;
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
  `하이브리드 스팟 sim — TRIALS=${TRIALS_PER_MONSTER}/monster, depth=${DEPTHS.join(",")}`,
);
for (const depth of DEPTHS) {
  console.log(`\ndepth ${depth}`);
  for (const c of CASES) {
    const r = runCell(c, depth);
    console.log(
      `${c.label.padEnd(8)} Lv${String(c.level).padStart(3)} ` +
        `wr=${r.wr.toFixed(1).padStart(5)}% ` +
        `winT=${r.winTurns.toFixed(1).padStart(5)} ` +
        `lossHp=${r.lossEnemyHpPct.toFixed(1).padStart(5)}% ` +
        `atk=${String(r.player.atk).padStart(4)} ` +
        `matk=${String(r.player.magicAtk ?? 0).padStart(4)} ` +
        `def=${String(r.player.def).padStart(4)} ` +
        `hp=${String(r.player.maxHp).padStart(5)} ` +
        `heal=${((r.player.healMult ?? 1) * 100).toFixed(0).padStart(3)}% ` +
        `berserk=${r.player.berserkAtkPctPerLostHpPct ?? 0}`,
    );
  }
}
