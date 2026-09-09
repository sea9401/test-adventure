import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveV2SkillCast, type V2SkillCastInput } from "./combatShared";
import { initialBattleState, applyPlayerV2SkillCast, type PlayerCombat } from "./engine";
import { initialBattleStatePvP, castV2SkillOnAttackerTurnPvP } from "./engine-pvp";
import { smartDefaultPatternFromEquipped, type V2SkillId, type V2SkillsState } from "@/adventure/data/v2/v2Skills";

const brand = "v2c_pyromancer_brand";
const collapse = "v2c_infernomancer_collapse";
const skills = (id: V2SkillId): V2SkillsState => ({ learned: [id], equipped: [id] });
function input(id: V2SkillId, patterned = false): V2SkillCastInput {
  return {
    skills: skills(id), cooldowns: {}, procRoll: 0,
    ...(patterned ? { combatPattern: smartDefaultPatternFromEquipped([id]), applyProcInPattern: true } : {}),
    attacker: { atk: 10, magicAtk: 100, int: 30, mp: 10000, maxHp: 1000, selfBuffs: {}, selfDebuffs: {} },
    target: { def: 40, magicDef: 40, selfBuffs: {}, selfDebuffs: {} },
  };
}
const player: PlayerCombat = { hp: 1000, maxHp: 1000, mp: 10000, maxMp: 10000, atk: 10, magicAtk: 100, intStat: 30, def: 0, spd: 100, evasionPct: 0, accuracyPct: 100, attackCount: 1 };
afterEach(() => vi.restoreAllMocks());

describe("화염 심화 실제 시전", () => {
  it.each([false, true])("패턴 %s: 낙인은 마법 피해·연소·지속 피해 강화를 적용한다", patterned => {
    const cast = resolveV2SkillCast(input(brand, patterned));
    expect(cast.castSkillId).toBe(brand);
    expect(Math.abs(cast.enemyDamage - 194)).toBeLessThanOrEqual(1);
    expect(cast.enemyDotVulnToApply).toEqual({ pct: 25, turns: 3 });
    expect(cast.dotsToApplyToTarget).toEqual([expect.objectContaining({ tag: "burn", stacks: 1, maxStacks: 1, turns: 2 })]);
  });
  it.each([false, true])("패턴 %s: 겁화는 연소 없이도 고위력 마법과 방어 무시 추가 피해를 준다", patterned => {
    const args = input(collapse, patterned);
    expect(Math.abs(resolveV2SkillCast(args).enemyDamage - 428)).toBeLessThanOrEqual(1);
    args.target.magicDef = 1000;
    expect(Math.abs(resolveV2SkillCast(args).enemyDamage - 79)).toBeLessThanOrEqual(1);
    args.attacker.mp = 0;
    expect(resolveV2SkillCast(args).castSkillId).toBeNull();
  });
  it("PvE에서 연소와 지속 피해 취약을 대상에게 적용한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const enemy = { name: "허수아비", tags: [], hp: 10000, atk: 1, def: 0, spd: 1, exp: 0, drops: [] };
    const initial = initialBattleState(player, enemy, "홍염술사", skills(brand));
    const cast = applyPlayerV2SkillCast(initial, player, { selfBuffs: {}, selfDebuffs: {}, enemyDebuffs: {} });
    expect(cast.state.stacks).toMatchObject({ enemyDotVulnPct: 25, enemyDotVulnTurns: 3 });
    expect(cast.state.enemyV2Dots).toEqual([expect.objectContaining({ tag: "burn", stacks: 1 })]);
    expect(cast.state.enemyHp).toBeLessThan(10000);
  });
  it.each(["p1", "p2"] as const)("PvP %s도 같은 대상을 약화하고 마법 피해를 준다", who => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const other = who === "p1" ? "p2" : "p1";
    const initial = initialBattleStatePvP(player, player, "A", "B", skills(brand), skills(brand));
    const cast = castV2SkillOnAttackerTurnPvP(initial, who);
    expect(cast.state[other].stacks).toMatchObject({ dotVulnPct: 25, dotVulnTurns: 3 });
    expect(cast.state[other].v2Dots).toEqual([expect.objectContaining({ tag: "burn", stacks: 1 })]);
    expect(cast.state[other].hp).toBeLessThan(1000);
  });
});

describe("불꽃의 정신 MP 할인", () => {
  it.each([false,true])("패턴 %s도 할인된 MP로 화염 주문을 선택·지불한다", patterned => {
    for (const id of ["v2c_firemage_inferno",brand,collapse] as const) {
      const args=input(id,patterned);
      const base=resolveV2SkillCast(args).mpSpent;
      args.skills.learned.push("v2c_pyromancer_spirit");
      args.skills.equipped.push("v2c_pyromancer_spirit");
      args.attacker.mp=base-Math.floor(base*0.2);
      const cast=resolveV2SkillCast(args);
      expect(cast.castSkillId).toBe(id);
      expect(cast.mpSpent).toBe(args.attacker.mp);
      expect(cast.nextMp).toBe(0);
      args.attacker.mp-=1;
      expect(resolveV2SkillCast(args).castSkillId).toBeNull();
    }
  });
  it("다른 직접 마법 MP 할인과 합산해도 최소 1 MP를 지불한다", () => {
    const args=input(collapse);
    args.skills.learned.push("v2c_pyromancer_spirit");args.skills.equipped.push("v2c_pyromancer_spirit");
    args.magicMpCostReductionPct=20;
    expect(resolveV2SkillCast(args).mpSpent).toBe(84);
    args.magicMpCostReductionPct=90;args.attacker.mp=1;
    expect(resolveV2SkillCast(args).mpSpent).toBe(1);
    args.attacker.mp=0;
    expect(resolveV2SkillCast(args).castSkillId).toBeNull();
  });
  it("미장착·미학습 패시브와 다른 속성 주문은 할인하지 않는다", () => {
    const args=input("v2c_aeromancer_blade");
    const base=resolveV2SkillCast(args).mpSpent;
    args.skills.learned.push("v2c_pyromancer_spirit");args.skills.equipped.push("v2c_pyromancer_spirit");
    expect(resolveV2SkillCast(args).mpSpent).toBe(base);
    const fire=input(collapse);const cost=resolveV2SkillCast(fire).mpSpent;
    fire.skills.learned.push("v2c_pyromancer_spirit");
    expect(resolveV2SkillCast(fire).mpSpent).toBe(cost);
    fire.skills.learned=[collapse];fire.skills.equipped.push("v2c_pyromancer_spirit");
    expect(resolveV2SkillCast(fire).mpSpent).toBe(cost);
  });
});
