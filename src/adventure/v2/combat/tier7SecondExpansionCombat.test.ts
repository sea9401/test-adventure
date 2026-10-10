import { afterEach, describe, expect, it, vi } from "vitest";
import { smartDefaultPatternFromEquipped, type V2SkillId, type V2SkillsState } from "@/adventure/data/v2/v2Skills";
import { makeBleedDot, resolveV2SkillCast, type V2SkillCastInput } from "./combatShared";
import { applyPlayerV2SkillCast, initialBattleState, type PlayerCombat } from "./engine";
import { castV2SkillOnAttackerTurnPvP, initialBattleStatePvP } from "./engine-pvp";

const id = (value: string) => value as V2SkillId;
const frostgale = id("v2c_tempest_frostgale");
const skystorm = id("v2c_tempest_skystorm");
const collapse = id("v2c_titan_collapse");
const armor = id("v2c_titan_armor");
const arcanebolt = id("v2c_runelord_arcanebolt");
const cycle = id("v2c_runelord_cycle");
const annihilation = id("v2c_bloodheaven_annihilation");
const descent = id("v2c_bloodheaven_descent");
const devour = id("v2c_behemoth_devour");
const swallow = id("v2c_behemoth_swallow");
const actives = [frostgale, skystorm, collapse, armor, arcanebolt, cycle, annihilation, descent, devour, swallow];
const attacks = [frostgale, collapse, arcanebolt, annihilation, devour, swallow];

const skills = (skill: V2SkillId): V2SkillsState => ({ learned: [skill], equipped: [skill] });
function input(skill: V2SkillId): V2SkillCastInput {
  return { skills: skills(skill), cooldowns: {}, procRoll: 0,
    combatPattern: smartDefaultPatternFromEquipped([skill]), applyProcInPattern: true,
    attacker: { atk: 100, magicAtk: 100, str: 60, int: 60, def: 100, spi: 100, currentHp: 800, maxHp: 1000, mp: 10000, maxMp: 10000, selfBuffs: {}, selfDebuffs: {} },
    target: { def: 40, magicDef: 40, currentHp: 1000, maxHp: 1000, selfBuffs: {}, selfDebuffs: {} } };
}
const player: PlayerCombat = { hp: 8000, maxHp: 10000, mp: 10000, maxMp: 10000, atk: 100, magicAtk: 100, strStat: 60, intStat: 60, spiStat: 100, def: 100, spd: 100, evasionPct: 0, accuracyPct: 100, attackCount: 1 };
const enemy = { name: "허수아비", tags: [], hp: 10000, atk: 1, def: 0, spd: 1, exp: 0, drops: [] };
const noFx = { selfBuffs: {}, selfDebuffs: {}, enemyDebuffs: {} };
afterEach(() => vi.restoreAllMocks());

describe("7차 두 번째 확장 패키지 실제 전투", () => {
  it.each(attacks)("%s는 직접 피해를 준다", (skill) => {
    const cast = resolveV2SkillCast(input(skill));
    expect(cast.castSkillId).toBe(skill);
    expect(cast.enemyDamage).toBeGreaterThan(0);
  });

  it("템페스트는 한기를 쌓고, 천공 빙풍은 피해 없이 회피 강화가 없을 때만 시전한다", () => {
    expect(resolveV2SkillCast(input(frostgale)).frostChillGain).toBe(2);
    const gale = resolveV2SkillCast(input(skystorm));
    expect(gale.castSkillId).toBe(skystorm);
    expect(gale.enemyDamage).toBe(0);
    const evading = input(skystorm);
    evading.attacker.selfBuffPctActive = { evasion: true };
    expect(resolveV2SkillCast(evading).castSkillId).toBeNull();
  });

  it("타이탄은 보호막이 있을 때 더 강하게 치고, 갑주는 보호막이 없을 때만 시전한다", () => {
    const base = resolveV2SkillCast(input(collapse));
    expect(resolveV2SkillCast({ ...input(collapse), attacker: { ...input(collapse).attacker, def: 300 } }).enemyDamage).toBeGreaterThan(base.enemyDamage);
    expect(resolveV2SkillCast(input(armor)).shieldToApply?.hp).toBeGreaterThan(0);
    const covered = input(armor);
    covered.attacker.selfShieldActive = true;
    expect(resolveV2SkillCast(covered).castSkillId).toBeNull();
  });

  it("룬 순환은 피해 없이 MP를 회복하고 지능 강화가 없을 때만 시전한다", () => {
    const cast = resolveV2SkillCast(input(cycle));
    expect(cast.enemyDamage).toBe(0);
    expect(cast.manaRestored).toBeGreaterThan(0);
    const buffed = input(cycle);
    buffed.attacker.selfStatBuffActive = { int: true };
    expect(resolveV2SkillCast(buffed).castSkillId).toBeNull();
  });

  it("혈천마신은 힘 강화가 없을 때만 마신강림을 시전한다", () => {
    expect(resolveV2SkillCast(input(descent)).castSkillId).toBe(descent);
    const buffed = input(descent);
    buffed.attacker.selfStatBuffActive = { str: true };
    expect(resolveV2SkillCast(buffed).castSkillId).toBeNull();
  });

  it("베히모스는 네 번 타격하고 출혈 3중첩을 부여한다", () => {
    const cast = resolveV2SkillCast(input(devour));
    expect(cast.hitDamages).toHaveLength(4);
    expect(cast.dotsToApplyToTarget).toEqual([expect.objectContaining({ tag: "bleed", stacks: 3 })]);
  });

  it("대지 삼킴은 출혈 10중첩 대상에게만 관통·회복을 얻는다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const bleed = (stacks: number) => [makeBleedDot({ stacks, turns: 3, flatPerStack: 7, sourceAtk: 100 })];
    const pve = (stacks: number) => {
      const initial = initialBattleState(player, { ...enemy, def: 80 }, "7차", skills(swallow));
      initial.enemyV2Dots = bleed(stacks);
      const cast = applyPlayerV2SkillCast(initial, player, noFx);
      return { damage: initial.enemyHp - cast.state.enemyHp, healed: cast.state.playerHp - initial.playerHp };
    };
    expect(pve(9).damage).toBeGreaterThan(0);
    expect(pve(9).healed).toBe(0);
    expect(pve(10).healed).toBeGreaterThan(0);
    expect(pve(10).damage).toBeGreaterThan(pve(9).damage);
    for (const who of ["p1", "p2"] as const) {
      const other = who === "p1" ? "p2" : "p1";
      const run = (stacks: number) => {
        const initial = initialBattleStatePvP(player, { ...player, def: 80 }, "A", "B", skills(swallow), skills(swallow));
        initial[other].v2Dots = bleed(stacks);
        return castV2SkillOnAttackerTurnPvP(initial, who).state[who].hp - initial[who].hp;
      };
      expect(run(9)).toBe(0);
      expect(run(10)).toBeGreaterThan(0);
    }
  });

  it.each(["pve", "p1", "p2"] as const)("거신 붕괴는 %s에서 시전 전 보호막이 있으면 마법 피해가 커진다", (mode) => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const run = (shield: number) => {
      if (mode === "pve") {
        const initial = initialBattleState(player, enemy, "7차", skills(collapse));
        initial.stacks.playerShield = shield;
        return initial.enemyHp - applyPlayerV2SkillCast(initial, player, noFx).state.enemyHp;
      }
      const other = mode === "p1" ? "p2" : "p1";
      const initial = initialBattleStatePvP(player, player, "A", "B", skills(collapse), skills(collapse));
      initial[mode].stacks.playerShield = shield;
      return initial[other].hp - castV2SkillOnAttackerTurnPvP(initial, mode).state[other].hp;
    };
    expect(run(500)).toBeGreaterThan(run(0));
  });

  it.each(actives)("%s는 MP 부족 시 효과를 만들지 않는다", (skill) => {
    const args = input(skill);
    args.attacker.mp = 0;
    const cast = resolveV2SkillCast(args);
    expect(cast.castSkillId).toBeNull();
    expect(cast.enemyDamage).toBe(0);
    expect(cast.shieldToApply).toBeUndefined();
    expect(cast.dotsToApplyToTarget).toEqual([]);
  });

  it("PvE에서 피해·보호막·회복·출혈을 실제 전투 상태에 반영한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    for (const skill of attacks) {
      const cast = applyPlayerV2SkillCast(initialBattleState(player, enemy, "7차", skills(skill)), player, noFx);
      expect(cast.state.enemyHp, skill).toBeLessThan(10000);
    }
    const shield = applyPlayerV2SkillCast(initialBattleState(player, enemy, "7차", skills(armor)), player, noFx);
    expect(shield.state.stacks.playerShield).toBeGreaterThan(0);
    const devoured = applyPlayerV2SkillCast(initialBattleState(player, enemy, "7차", skills(devour)), player, noFx);
    expect(devoured.state.enemyV2Dots).toEqual([expect.objectContaining({ tag: "bleed" })]);
  });

  it.each(["p1", "p2"] as const)("PvP %s에서도 공격과 부가 효과를 적용한다", (who) => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const other = who === "p1" ? "p2" : "p1";
    for (const skill of attacks) {
      const cast = castV2SkillOnAttackerTurnPvP(initialBattleStatePvP(player, player, "A", "B", skills(skill), skills(skill)), who);
      expect(cast.state[other].hp, skill).toBeLessThan(8000);
      if (skill === devour) expect(cast.state[other].v2Dots).toEqual([expect.objectContaining({ tag: "bleed" })]);
    }
    const shield = castV2SkillOnAttackerTurnPvP(initialBattleStatePvP(player, player, "A", "B", skills(armor), skills(armor)), who);
    expect(shield.state[who].stacks.playerShield).toBeGreaterThan(0);
  });
});
