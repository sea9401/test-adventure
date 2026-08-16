import { resolveBattlePvP } from "../src/adventure/v2/combat/engine-pvp";
import type { PlayerCombat } from "../src/adventure/v2/combat/engine";
import { IRON_WALL_REFLECT_DEF_PCT } from "../src/adventure/v2/combat/fortressKnight";

const runs = Math.max(1, Number.parseInt(process.env.SIM_RUNS ?? "200", 10));

const fortress: PlayerCombat = {
  hp: 6_000,
  maxHp: 6_000,
  mp: 1_000,
  maxMp: 1_000,
  atk: 220,
  magicAtk: 100,
  def: 700,
  magicDef: 520,
  spd: 50,
  evasionPct: 5,
  accuracyPct: 100,
  accRating: 100,
  attackCount: 1,
  fortressImpactOnHit: true,
  fortressImpactDamagePctPerStack: 20,
  fortressDefSkillStatCoefPct: 15,
  passiveDamageTakenReductionPct: 8,
};

const mage: PlayerCombat = {
  hp: 6_500,
  maxHp: 6_500,
  mp: 1_200,
  maxMp: 1_200,
  atk: 100,
  magicAtk: 1_325,
  def: 180,
  magicDef: 450,
  spd: 65,
  evasionPct: 8,
  accuracyPct: 100,
  accRating: 100,
  attackCount: 1,
  magicBarrierMax: 2_500,
  magicBarrierPvpAbsorbPct: 25,
  magicBarrierPvpEfficiencyPct: 20,
};

const fortressSkills = {
  learned: [
    "v2c_warden_thorns",
    "v2c_ironknight_guard",
    "v2c_ironknight_wall",
    "v2c_fortressknight_ram",
    "v2c_fortressknight_citadel",
  ],
  equipped: [
    "v2c_warden_thorns",
    "v2c_ironknight_guard",
    "v2c_ironknight_wall",
    "v2c_fortressknight_ram",
    "v2c_fortressknight_citadel",
  ],
} as const;

const mageSkills = {
  learned: ["v2c_mage_fireball", "v2c_mage_acumen"],
  equipped: ["v2c_mage_fireball", "v2c_mage_acumen"],
} as const;

function seededRandom(seed: number): () => number {
  let value = (seed * 0x9e3779b9) >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

let fortressWins = 0;
let mageWins = 0;
let draws = 0;
const reflectTotals: number[] = [];
const ramTotals: number[] = [];
const reflectHits: number[] = [];
const ramHits: number[] = [];

const originalRandom = Math.random;
try {
  for (let seed = 1; seed <= runs; seed += 1) {
    Math.random = seededRandom(seed);
    const result = resolveBattlePvP(
      fortress,
      mage,
      "성채기사",
      "마나 실드 마법사",
      {
        pickAction: () => ({ kind: "attack" }),
        potions: { p1: {}, p2: {} },
        v2Skills: {
          p1: fortressSkills,
          p2: mageSkills,
        },
      } as never,
    );
    if (result.outcome === "p1_win") fortressWins += 1;
    else if (result.outcome === "p2_win") mageWins += 1;
    else draws += 1;

    let reflectTotal = 0;
    let ramTotal = 0;
    for (const entry of result.finalState.log) {
      if (entry.text.includes("[철벽 반사]")) {
        const damage = Number(entry.text.match(/에게 ([0-9,]+) 반사 피해/)?.[1].replaceAll(",", "") ?? 0);
        reflectTotal += damage;
        if (damage > 0) reflectHits.push(damage);
      }
      if (entry.text.startsWith("성채 충각!")) {
        const damage = Number(entry.text.match(/ ([0-9,]+) 피해/)?.[1].replaceAll(",", "") ?? 0);
        ramTotal += damage;
        if (damage > 0) ramHits.push(damage);
      }
    }
    reflectTotals.push(reflectTotal);
    ramTotals.push(ramTotal);
  }
} finally {
  Math.random = originalRandom;
}

console.log(JSON.stringify({
  coefficientPct: IRON_WALL_REFLECT_DEF_PCT,
  runs,
  fortressWinRatePct: (fortressWins / runs) * 100,
  mageWinRatePct: (mageWins / runs) * 100,
  drawRatePct: (draws / runs) * 100,
  medianIronWallReflectDamage: median(reflectTotals),
  medianFortressRamDamage: median(ramTotals),
  medianIronWallReflectHit: median(reflectHits),
  medianFortressRamHit: median(ramHits),
}, null, 2));
