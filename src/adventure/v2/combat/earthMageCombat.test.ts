import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveV2SkillCast, type V2SkillCastInput } from "./combatShared";
import { initialBattleState, applyPlayerV2SkillCast, type PlayerCombat } from "./engine";
import { initialBattleStatePvP, castV2SkillOnAttackerTurnPvP } from "./engine-pvp";
import { type V2SkillId, type V2SkillsState } from "@/adventure/data/v2/v2Skills";

const upheaval = "v2c_geomancer_upheaval";
const cataclysm = "v2c_tectomancer_cataclysm";
const skills = (id: V2SkillId): V2SkillsState => ({ learned: [id], equipped: [id] });
const player: PlayerCombat = { hp: 10000, maxHp: 10000, mp: 10000, maxMp: 10000, atk: 100, magicAtk: 1000, intStat: 100, def: 0, spd: 100, evasionPct: 0, accuracyPct: 100, attackCount: 1 };
const enemy = { name: "허수아비", tags: [], hp: 100000, atk: 1, def: 0, spd: 100, exp: 0, drops: [] };
const buffs = { selfBuffs: {}, selfDebuffs: {}, enemyDebuffs: {} };
afterEach(() => vi.restoreAllMocks());

function input(id: V2SkillId): V2SkillCastInput {
  return {
    skills: skills(id), cooldowns: {}, procRoll: 0,
    attacker: { atk: 100, magicAtk: 1000, int: 100, mp: 10000, maxHp: 10000, maxMp: 10000, selfBuffs: {}, selfDebuffs: {} },
    target: { def: 0, magicDef: 0, selfBuffs: {}, selfDebuffs: {} },
  };
}

describe("대지 보호막 생성", () => {
  it.each([
    [upheaval, 125, 1980],
    [cataclysm, 140, 3080],
  ] as const)("%s의 실제 피해와 MP 비용 경계를 적용한다", (id, cost, damage) => {
    const args = input(id);
    args.attacker.mp = cost - 1;
    expect(resolveV2SkillCast(args).castSkillId).toBeNull();
    args.attacker.mp = cost;
    const cast = resolveV2SkillCast(args);
    expect(cast.castSkillId).toBe(id);
    expect(cast.nextMp).toBe(0);
    expect(cast.enemyDamage).toBe(damage);
  });

  it("지맥 융기는 새 보호막만 30% 강화하고 MP 부족 시 발동하지 않는다", () => {
    const args = input(upheaval);
    const base = resolveV2SkillCast(args);
    expect(base.castSkillId).toBe(upheaval);
    expect(base.shieldToApply?.hp).toBe(2400);
    args.attacker.skillShieldPowerPct = 30;
    args.attacker.selfShield = 1000;
    expect(resolveV2SkillCast(args).shieldToApply?.hp).toBe(3120);
    args.attacker.mp = 0;
    expect(resolveV2SkillCast(args).castSkillId).toBeNull();
    expect(resolveV2SkillCast(args).shieldToApply).toBeUndefined();
  });

  it("기존 지각진도 새 스킬 보호막만 강화하고 피해·지연은 유지한다", () => {
    const args = input("v2c_earthmage_tectonic");
    const base = resolveV2SkillCast(args);
    args.attacker.skillShieldPowerPct = 30;
    const boosted = resolveV2SkillCast(args);
    expect(boosted.shieldToApply?.hp).toBe(780);
    expect(boosted.enemyDamage).toBe(base.enemyDamage);
    expect(boosted.enemyDelayToApply).toEqual({ pct: 35 });
  });

  it("HP·MP 기반 보호막을 각각 한 번 강화하며 비정상 배율은 무시한다", () => {
    const args = input("v2c_mage_shield");
    args.attacker.skillShieldPowerPct = 30;
    expect(resolveV2SkillCast(args).shieldToApply).toMatchObject({ hp: 1560, mp: 1820 });
    for (const pct of [0, -30, NaN, Infinity]) {
      args.attacker.skillShieldPowerPct = pct;
      expect(resolveV2SkillCast(args).shieldToApply).toMatchObject({ hp: 1200, mp: 1400 });
    }
  });

  it.each(["p1", "p2"] as const)("PvP %s의 생성량 강화와 모드 보정은 한 번씩 적용된다", who => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const caster = { ...player, skillShieldPowerPct: 30 };
    const initial = initialBattleStatePvP(caster, caster, "A", "B", skills(upheaval), skills(upheaval));
    initial.sustainMultiplier = 0.65;
    initial[who].stacks.playerShield = 1000;
    const cast = castV2SkillOnAttackerTurnPvP(initial, who).state;
    expect(cast[who].stacks.playerShield).toBe(3028);
    const recast = castV2SkillOnAttackerTurnPvP(cast, who).state;
    expect(recast[who].stacks.playerShield).toBe(5056);
  });

  it("PvE에서 기존 보호막을 재증폭하지 않고 시전마다 생성량만 누적한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const caster = { ...player, skillShieldPowerPct: 30, bulwarkShield: 1000 };
    const initial = initialBattleState(caster, enemy, "대지", skills(upheaval));
    expect(initial.stacks.playerShield).toBe(1000);
    const cast = applyPlayerV2SkillCast(initial, caster, buffs).state;
    expect(cast.stacks.playerShield).toBe(4120);
    expect(applyPlayerV2SkillCast(cast, caster, buffs).state.stacks.playerShield).toBe(7240);
  });
});

describe.each(["pve", "p1", "p2"] as const)("%s 보호막 조건부 직접 마법", mode => {
  function run(id: V2SkillId, shield: number, passivePct = 0, basePct = 0) {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const caster = { ...player, shieldedMagicSkillDamagePct: passivePct, magicSkillDamagePct: basePct };
    if (mode === "pve") {
      const initial = initialBattleState(caster, enemy, "대지", skills(id));
      initial.stacks.playerShield = shield;
      initial.stacks.enemyFrostChillStacks = 2;
      const cast = applyPlayerV2SkillCast(initial, caster, buffs);
      return { damage: initial.enemyHp - cast.state.enemyHp, shield: cast.state.stacks.playerShield, delay: cast.enemyDelayPct, dots: cast.state.enemyV2Dots, freeze: cast.state.log.find(e => e.text.startsWith("빙결! "))?.text };
    }
    const other = mode === "p1" ? "p2" : "p1";
    const initial = initialBattleStatePvP(caster, caster, "A", "B", skills(id), skills(id));
    initial[mode].stacks.playerShield = shield;
    initial[other].stacks.frostChillStacks = 2;
    const cast = castV2SkillOnAttackerTurnPvP(initial, mode);
    return { damage: initial[other].hp - cast.state[other].hp, shield: cast.state[mode].stacks.playerShield, delay: cast.enemyDelayPct, dots: cast.state[other].v2Dots, freeze: cast.state.log.find(e => e.text.startsWith("빙결! "))?.text };
  }

  it("보호막 1부터 보너스를 받고 잔량과 무관하며 소모하지 않는다", () => {
    const base = run(cataclysm, 0);
    expect(base.damage).toBeGreaterThan(0);
    expect(base.delay).toBe(20);
    const boosted = run(cataclysm, 1);
    expect(boosted.damage).toBeGreaterThan(base.damage);
    expect(Math.abs(boosted.damage - base.damage * 1.2)).toBeLessThanOrEqual(2);
    expect(run(cataclysm, 10000).damage).toBe(boosted.damage);
    expect(boosted.shield).toBe(1);
  });

  it("패시브와 스킬 보너스를 기존 마법 증폭에 가산한다", () => {
    const base = run(cataclysm, 0);
    expect(base.damage).toBeGreaterThan(0);
    expect(Math.abs(run(cataclysm, 1, 20, 10).damage - base.damage * 1.5)).toBeLessThanOrEqual(2);
    expect(Math.abs(run(cataclysm, 0, 20, 10).damage - base.damage * 1.1)).toBeLessThanOrEqual(2);
  });

  it("같은 시전으로 만든 보호막은 그 공격을 강화하지 않는다", () => {
    expect(run(upheaval, 0, 20).damage).toBe(run(upheaval, 0).damage);
    expect(run(upheaval, 1, 20).damage).toBeGreaterThan(run(upheaval, 0, 20).damage);
  });

  it("다른 직업 마법은 강화하지만 물리 스킬은 강화하지 않는다", () => {
    const magic = "v2c_pyromancer_brand";
    expect(run(magic, 1, 20).damage).toBeGreaterThan(run(magic, 1).damage);
    const physical = "v2_skill_strike";
    expect(run(physical, 1, 20).damage).toBe(run(physical, 1).damage);
  });

  it("직접 마법을 강화해도 연소와 빙결 추가 피해는 증가하지 않는다", () => {
    const fire = run("v2c_pyromancer_brand", 1);
    expect(fire.dots).toHaveLength(1);
    expect(run("v2c_pyromancer_brand", 1, 20).dots).toEqual(fire.dots);
    const frost = run("v2c_cryomancer_absolutezero", 1);
    expect(frost.freeze).toBeDefined();
    const boosted = run("v2c_cryomancer_absolutezero", 1, 20);
    expect(boosted.damage).toBeGreaterThan(frost.damage);
    expect(boosted.freeze).toBe(frost.freeze);
  });
});
