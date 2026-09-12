// NEXT_PUBLIC_V2_CORE_LOOP_V2=true NEXT_PUBLIC_V2_SKILL_PROC_IN_PATTERN=true NODE_PATH=./scripts/server-only-stub node --import tsx scripts/sim-earth-mage-advancement.ts
// 동일 성장·무장비·30 SP, 고정 시드. 최적 빌드 탐색이 아닌 회귀/극단값 점검이다.
import assert from "node:assert/strict";
import { derivePlayerCombatV2Pure } from "../src/lib/server/derivePlayerCombatV2";
import { aggregateEquippedPassives, V2_SKILLS, spCostOf, v2SkillMpCostValue, smartDefaultPatternFromEquipped, type V2SkillsState, type V2SkillId } from "../src/adventure/data/v2/v2Skills";
import { resolveBattleAtb } from "../src/adventure/v2/combat/engine.atb";
import { resolveBattlePvPAtb } from "../src/adventure/v2/combat/engine.pvp-atb";
import type { Monster } from "../src/adventure/data/monsters";

const trials = 50;
const loadouts: Record<string, V2SkillId[]> = {
  earth4: ["v2c_earthmage_tectonic", "v2c_earthmage_bedrock", "v2c_mage_shield", "v2c_magus_acumen3", "v2c_caster_acumen", "v2c_mage_acumen", "v2c_boxer_fortitude", "v2c_martial_fortitude"],
  earth5: ["v2c_geomancer_upheaval", "v2c_earthmage_tectonic", "v2c_geomancer_heart", "v2c_geomancer_barrier", "v2c_mage_acumen"],
  earth6: ["v2c_tectomancer_cataclysm", "v2c_geomancer_upheaval", "v2c_tectomancer_ground", "v2c_geomancer_barrier", "v2c_mutant_adaptation"],
  fire5: ["v2c_pyromancer_brand", "v2c_pyromancer_spirit", "v2c_pyromancer_burn", "v2c_magus_acumen3", "v2c_mage_acumen"],
  fire6: ["v2c_infernomancer_collapse", "v2c_pyromancer_brand", "v2c_infernomancer_burn"],
  frost5: ["v2c_cryomancer_absolutezero", "v2c_frostmage_glacier", "v2c_cryomancer_freezingpoint", "v2c_frostmage_frozenheart", "v2c_caster_acumen", "v2c_mage_acumen"],
  frost6: ["v2c_frostsovereign_eternalprison", "v2c_cryomancer_absolutezero", "v2c_frostsovereign_permafrost", "v2c_magus_acumen3"],
};
function build(ids: V2SkillId[]) {
  assert.equal(ids.reduce((sum, id) => sum + spCostOf(V2_SKILLS[id]), 0), 30);
  const p = aggregateEquippedPassives(ids);
  return derivePlayerCombatV2Pure({
    level: 100, allocatedStats: { str: 100, vit: 250, dex: 100, luk: 0, int: 500, spi: 400 },
    v2Equipped: {}, playerClass: "mage", classTier: 6,
    statPct: p.statPct, maxHpPct: p.maxHpPct, maxMpPct: p.maxMpPct,
    passiveDefPct: p.defPct, passiveMagicDefPct: p.magicDefPct,
    passiveMagicSkillDamagePct: p.magicSkillDamagePct,
    passiveSkillShieldPowerPct: p.skillShieldPowerPct,
    passiveShieldedMagicSkillDamagePct: p.shieldedMagicSkillDamagePct,
    passiveBurnDamagePct: p.burnDamagePct, passiveFreezeDamagePct: p.freezeDamagePct,
    passiveFreezeDelayPct: p.freezeDelayPct, passiveFreezeRetainStacks: p.freezeRetainStacks,
    passiveMagicBarrier: p.magicBarrier, passiveEvasionPct: p.evasionPct,
    passiveStatusDamageReductionPct: p.statusDamageReductionPct,
  }).player;
}
const builds = Object.fromEntries(Object.entries(loadouts).map(([name, ids]) => [name, build(ids)]));
const reference = builds.earth6;
const commonEnemy: Monster = { name: "비교 적", tags: [], hp: 14000, atk: 500, def: 100, magicDef: 100, spd: reference.spd, exp: 0 };
const scenarios: Record<string, Monster> = {
  ordinary: commonEnemy,
  heavy: { ...commonEnemy, atk: 1600, spd: reference.spd * 0.65 },
  fast: { ...commonEnemy, atk: 650, spd: reference.spd * 2.5 },
  multihit: { ...commonEnemy, atk: 650, bonusAttackChancePct: 200, spd: reference.spd * 1.4 },
  armored: { ...commonEnemy, atk: 700, def: 1500, magicDef: 1500 },
  endurance: { ...commonEnemy, hp: 1000000, atk: 200 },
};
function skillState(name: string): V2SkillsState {
  const ids = loadouts[name];
  const pattern = smartDefaultPatternFromEquipped(ids);
  const generator = name === "earth4" ? "v2c_mage_shield"
    : name === "earth5" || name === "earth6" ? "v2c_geomancer_upheaval" : undefined;
  if (generator) {
    pattern.blocks = [
      { condition: { kind: "self_shield", active: false }, action: { kind: "skill", skillId: generator } },
      ...pattern.blocks.filter(block => block.action.kind !== "skill" || block.action.skillId !== generator),
    ];
  }
  return { learned: ids, equipped: ids, pattern };
}
const originalRandom = Math.random;
function seed(value: number) {
  let state = value >>> 0;
  Math.random = () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
const round = (n: number) => Math.round(n * 100) / 100;
const pve: unknown[] = [];
const pvp: unknown[] = [];
try {
  for (const [scenario, enemy] of Object.entries(scenarios)) {
    for (const [name, player] of Object.entries(builds)) {
      const ids = loadouts[name];
      const minMp = Math.min(...ids.filter(id => V2_SKILLS[id].category !== "passive").map(id => v2SkillMpCostValue(V2_SKILLS[id])));
      let wins = 0, damage = 0, actions = 0, enemyActions = 0, hp = 0, mp = 0, protectedActions = 0, maxShield = 0, starved = 0;
      for (let i = 0; i < trials; i++) {
        seed(i + 1);
        const result = resolveBattleAtb(player, enemy, name, {
          potions: {}, forceAtbSkills: true, maxTurns: 60,
          v2Skills: skillState(name),
          pickAction: () => ({ kind: "attack" }),
        });
        const final = result.finalState;
        let shield = 0, previousPlayerTick: number | undefined;
        for (const entry of final.log) {
          if (entry.turn === "player" && entry.kind !== "hp_bar" && entry.t != null && entry.t !== previousPlayerTick) {
            actions++;
            if (shield > 0) protectedActions++;
            previousPlayerTick = entry.t;
          }
          const gain = entry.text.match(/보호막 \+(\d+)/);
          const remaining = entry.text.match(/보호막이 .*흡수 \(남은 (\d+)\)/);
          if (gain) shield += Number(gain[1]);
          if (remaining) shield = Number(remaining[1]);
          maxShield = Math.max(maxShield, shield);
        }
        assert.equal(shield, final.stacks.playerShield, "보호막 로그 계측과 실제 최종 상태 일치");
        wins += result.outcome === "win" ? 1 : 0;
        damage += enemy.hp - final.enemyHp;
        hp += final.playerHp / final.playerMaxHp;
        mp += final.playerMp;
        starved += Number(final.log.some(entry => entry.kind === "hp_bar" && entry.playerMp != null && entry.playerMp < minMp));
        maxShield = Math.max(maxShield, final.stacks.playerShield);
        enemyActions += new Set(final.log.filter(entry => entry.turn === "enemy" && entry.t != null).map(entry => entry.t)).size;
      }
      pve.push({ scenario, name, winPct: wins * 100 / trials, damage: round(damage / trials), actions: round(actions / trials), enemyActions: round(enemyActions / trials), remainingHpPct: round(hp * 100 / trials), remainingMp: round(mp / trials), shieldUptimePct: round(protectedActions * 100 / Math.max(1, actions)), maxShield, mpStarvedPct: starved * 100 / trials });
    }
  }
  for (const opponent of ["earth4", "earth5", "fire5", "fire6", "frost5", "frost6"]) {
    let wins = 0, draws = 0;
    for (let i = 0; i < trials; i++) {
      seed(i + 1000);
      const swap = i % 2 === 1;
      const a = swap ? opponent : "earth6", b = swap ? "earth6" : opponent;
      const result = resolveBattlePvPAtb(builds[a], builds[b], a, b, {
        potions: { p1: {}, p2: {} }, pickAction: () => ({ kind: "attack" }),
        v2Skills: { p1: skillState(a), p2: skillState(b) },
      });
      wins += Number(result.outcome === (swap ? "p2_win" : "p1_win"));
      draws += Number(result.outcome === "draw");
    }
    pvp.push({ opponent, earth6WinPct: wins * 100 / trials, drawPct: draws * 100 / trials });
  }
} finally {
  Math.random = originalRandom;
}
console.log(JSON.stringify({ trials, spBudget: 30, loadouts, pve, pvp }, null, 2));
