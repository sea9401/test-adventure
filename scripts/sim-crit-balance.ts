import type { Monster } from "../src/adventure/data/monsters";
import {
  emptyV2SkillsState,
  type V2SkillId,
} from "../src/adventure/data/v2/v2Skills";
import { SKILL_CRIT_MULT } from "../src/adventure/data/v2/v2CombatConstants";
import {
  CRIT_OVERFLOW_DMG_CAP,
  CRIT_OVERFLOW_DMG_PER_PCT,
} from "../src/adventure/data/stats";
import {
  advanceTurn,
  applyPlayerV2SkillCast,
  initialBattleState,
  type PlayerCombat,
} from "../src/adventure/v2/combat/engine";

const TRIALS = 20_000;
const BARRAGE: V2SkillId = "v2c_mage_barrage";
const ENEMY_HP = 1_000_000_000;

const skills = {
  ...emptyV2SkillsState(),
  learned: [BARRAGE],
  equipped: [BARRAGE],
  pattern: {
    blocks: [
      {
        condition: { kind: "always" as const },
        action: { kind: "skill" as const, skillId: BARRAGE },
      },
    ],
  },
};

const enemy: Monster = {
  name: "밸런스 더미",
  tags: ["beast"],
  hp: ENEMY_HP,
  atk: 1,
  def: 100,
  spd: 1,
  exp: 1,
};

const basePlayer: PlayerCombat = {
  hp: 1_000_000,
  maxHp: 1_000_000,
  atk: 500,
  magicAtk: 500,
  def: 100,
  spd: 100,
  accuracyPct: 100,
  evasionPct: 0,
  attackCount: 1,
  maxMp: 100_000,
  critMult: 2.2,
};

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function averageDamage(
  player: PlayerCombat,
  attack: (player: PlayerCombat) => number,
): number {
  const originalRandom = Math.random;
  Math.random = seededRandom(0x5eed_2026);
  try {
    let total = 0;
    for (let i = 0; i < TRIALS; i += 1) total += attack(player);
    return total / TRIALS;
  } finally {
    Math.random = originalRandom;
  }
}

function basicAttackDamage(player: PlayerCombat): number {
  const state = initialBattleState(player, enemy, "시뮬레이터");
  const next = advanceTurn(state, player, "시뮬레이터");
  return state.enemyHp - next.enemyHp;
}

function activeSkillDamage(player: PlayerCombat): number {
  const state = initialBattleState(player, enemy, "시뮬레이터", skills);
  const next = applyPlayerV2SkillCast(state, player, {
    selfBuffs: {},
    selfDebuffs: {},
    enemyDebuffs: {},
  }).state;
  return state.enemyHp - next.enemyHp;
}

const scenarios = [
  {
    label: "일반 평타 (치확 50%)",
    player: { ...basePlayer, critChancePct: 50 },
    attack: basicAttackDamage,
  },
  {
    label: "일반 스킬 (치확 50%)",
    player: { ...basePlayer, critChancePct: 50 },
    attack: activeSkillDamage,
  },
  {
    label: "고행운 평타 (치확 175%)",
    player: { ...basePlayer, critChancePct: 175 },
    attack: basicAttackDamage,
  },
  {
    label: "고행운 스킬 (치확 175%·오버플로 적용)",
    player: {
      ...basePlayer,
      critChancePct: 175,
      skillCritOverflow: true,
    },
    attack: activeSkillDamage,
  },
] satisfies Array<{
  label: string;
  player: PlayerCombat;
  attack: (player: PlayerCombat) => number;
}>;

console.log(
  JSON.stringify(
    {
      trials: TRIALS,
      constants: {
        skillCritMult: SKILL_CRIT_MULT,
        critOverflowDamagePerPct: CRIT_OVERFLOW_DMG_PER_PCT,
        critOverflowDamageCap: CRIT_OVERFLOW_DMG_CAP,
      },
      scenarios: scenarios.map(({ label, player, attack }) => ({
        label,
        averageDamage: Number(averageDamage(player, attack).toFixed(3)),
      })),
    },
    null,
    2,
  ),
);
