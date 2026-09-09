import { afterEach, describe, expect, it, vi } from "vitest";
import { derivePlayerCombatV2FromSaves } from "@/lib/server/derivePlayerCombatV2";
import { initialBattleState, applyPlayerV2SkillCast, type PlayerCombat } from "./engine";
import { initialBattleStatePvP, castV2SkillOnAttackerTurnPvP } from "./engine-pvp";
import { applyPlayerDotDamageBonuses } from "./playerDotDamage";
import { V2_DOT_PRESETS } from "@/adventure/data/v2/statusEffects";
import { resolveV2SkillCast, tickV2Dots, v2DotPerStackDamage } from "./combatShared";
import { V2_SKILLS, type V2SkillId, type V2SkillsState } from "@/adventure/data/v2/v2Skills";

const brand = "v2c_pyromancer_brand";
const skills: V2SkillsState = { learned: [brand], equipped: [brand] };
const player: PlayerCombat = { hp: 10000, maxHp: 10000, mp: 10000, maxMp: 10000, atk: 100, magicAtk: 1000, intStat: 30, def: 0, spd: 100, accuracyPct: 100, evasionPct: 0, attackCount: 1 };
afterEach(() => vi.restoreAllMocks());
function bonusFromSave(equipped: string[]) {
  return derivePlayerCombatV2FromSaves({ character: { class: "warrior", specChoice: "paladin", level: 50 }, equipmentSave: {}, proficiencyRaw: {}, skillsRaw: { learned: equipped, equipped } })!.player.burnDamagePct;
}

describe("연소 피해 패시브", () => {
  it("연소는 공격력과 마법 공격력 중 높은 값을 시전 시 저장한다", () => {
    const cast = (atk: number, magicAtk?: number) => resolveV2SkillCast({
      skills, cooldowns: {}, procRoll: 0,
      attacker: { atk, magicAtk, int: 30, mp: 10000, maxHp: 1000, selfBuffs: {}, selfDebuffs: {} },
      target: { def: 0, selfBuffs: {}, selfDebuffs: {} },
    }).dotsToApplyToTarget[0];
    expect(cast(100, 1000).sourceAtk).toBe(1000);
    expect(cast(1000, 100)).toEqual(cast(100, 1000));
    expect(cast(1000, 1000).sourceAtk).toBe(1000);
    expect(tickV2Dots([cast(100, 1000)]).totalDmg).toBe(212);
    expect(cast(100).sourceAtk).toBe(100);
    expect(cast(100, 0).sourceAtk).toBe(100);
    expect(cast(0, 0).sourceAtk).toBe(0);
  });

  it.each(["v2c_firemage_inferno", brand])("%s의 연소는 차수 보정 없이 공통 공식을 사용한다", id => {
    const burn = V2_SKILLS[id as V2SkillId]?.effects.find(effect => effect.kind === "dot" && effect.tag === "burn");
    expect(burn).toMatchObject({ flatPerStack: 12, atkCoefPerStack: 0.2, pctMaxHpPerStack: 0, stacks: 1, maxStacks: 1, turns: 2 });
  });

  it("연소 보너스는 출혈·중독 파라미터를 바꾸지 않는다", () => {
    const dots = [V2_DOT_PRESETS.출혈, V2_DOT_PRESETS.중독, V2_DOT_PRESETS.연소].map(dot => ({ ...dot, sourceAtk: 100 }));
    const base = applyPlayerDotDamageBonuses(dots, 30, 0);
    const boosted = applyPlayerDotDamageBonuses(dots, 30, 80);
    expect(boosted.filter(dot => dot.tag !== "burn")).toEqual(base.filter(dot => dot.tag !== "burn"));
    expect(applyPlayerDotDamageBonuses(dots, 30, -10)).toEqual(base);
  });
  it("직업과 무관하게 서버에서 30·50을 합산하고 미장착은 추가하지 않는다", () => {
    expect(bonusFromSave([])).toBeUndefined();
    expect(bonusFromSave(["v2c_pyromancer_spirit", "v2c_infernomancer_heart"])).toBeUndefined();
    expect(bonusFromSave(["v2c_pyromancer_burn"])).toBe(30);
    expect(bonusFromSave(["v2c_infernomancer_burn"])).toBe(50);
    expect(bonusFromSave(["v2c_pyromancer_burn", "v2c_infernomancer_burn"])).toBe(80);
  });
  it.each(["pve", "p1", "p2"] as const)("%s에서 연소만 강화하고 재시전으로 배율이 중복되지 않는다", mode => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    function run(burnDamagePct: number) {
      const caster = { ...player, atk: 1000, magicAtk: 100, burnDamagePct };
      if (mode === "pve") {
        const enemy = { name: "허수아비", hp: 10000, atk: 1, def: 0, spd: 1, tags: [], exp: 0, drops: [] };
        const initial = initialBattleState(caster, enemy, "화염술사", skills);
        const cast = applyPlayerV2SkillCast(initial, caster, { selfBuffs: {}, selfDebuffs: {}, enemyDebuffs: {} }).state;
        expect(cast.enemyV2Dots.find(dot => dot.tag === "burn")?.sourceAtk).toBe(caster.atk);
        const recast = applyPlayerV2SkillCast(cast, caster, { selfBuffs: {}, selfDebuffs: {}, enemyDebuffs: {} }).state;
        return { rawTick: v2DotPerStackDamage(cast.enemyV2Dots[0], 10000), damage: initial.enemyHp - cast.enemyHp, tick: tickV2Dots(cast.enemyV2Dots, 10000).totalDmg, retick: tickV2Dots(recast.enemyV2Dots, 10000).totalDmg };
      }
      const other = mode === "p1" ? "p2" : "p1";
      const initial = initialBattleStatePvP(caster, caster, "A", "B", skills, skills);
      const cast = castV2SkillOnAttackerTurnPvP(initial, mode).state;
      expect(cast[other].v2Dots.find(dot => dot.tag === "burn")?.sourceAtk).toBe(caster.atk);
      const recast = castV2SkillOnAttackerTurnPvP(cast, mode).state;
      return { rawTick: v2DotPerStackDamage(cast[other].v2Dots[0], 1000), damage: initial[other].hp - cast[other].hp, tick: tickV2Dots(cast[other].v2Dots, 1000).totalDmg, retick: tickV2Dots(recast[other].v2Dots, 1000).totalDmg };
    }
    const base = run(0);
    const boosted = run(80);
    expect(boosted.damage).toBe(base.damage);
    expect(boosted.tick).toBe(Math.floor(base.rawTick * 1.8));
    expect(boosted.retick).toBe(boosted.tick);
  });
});

it("불꽃의 정신은 새 연소만 1행동 늘리고 기존 데이터와 다른 DoT를 바꾸지 않는다", () => {
  const dots = [
    {tag:"burn" as const,label:"연소",stacks:1,maxStacks:1,turns:2,flatPerStack:12,atkCoefPerStack:0.2,pctMaxHpPerStack:0,sourceAtk:100},
    {tag:"bleed" as const,label:"출혈",stacks:1,maxStacks:5,turns:3,flatPerStack:10,atkCoefPerStack:0.1,pctMaxHpPerStack:0,sourceAtk:100},
  ];
  const result = applyPlayerDotDamageBonuses(dots, 0, 80, 1);
  expect(result[0]).toMatchObject({turns:3,finalDamageMult:1.8});
  expect(result[1]).toEqual(dots[1]);
  expect(dots[0].turns).toBe(2);
  expect(applyPlayerDotDamageBonuses(dots,0,0,1)[0].turns).toBe(3);
});
