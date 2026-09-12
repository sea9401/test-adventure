import { afterEach, describe, expect, it, vi } from "vitest";
import { smartDefaultPatternFromEquipped, type V2SkillId, type V2SkillsState } from "@/adventure/data/v2/v2Skills";
import { resolveV2SkillCast, type V2SkillCastInput } from "./combatShared";
import { applyPlayerV2SkillCast, initialBattleState, type PlayerCombat } from "./engine";
import { castV2SkillOnAttackerTurnPvP, initialBattleStatePvP } from "./engine-pvp";

const strike = "v2c_aegis_strike" as V2SkillId;
const barrier = "v2c_aegis_barrier" as V2SkillId;
const judgment = "v2c_seraphim_judgment" as V2SkillId;
const wings = "v2c_seraphim_wings" as V2SkillId;
const claw = "v2c_dragonlord_claw" as V2SkillId;
const breath = "v2c_dragonlord_breath" as V2SkillId;
const skills = (id: V2SkillId): V2SkillsState => ({ learned: [id], equipped: [id] });
function input(id: V2SkillId): V2SkillCastInput {
  return { skills: skills(id), cooldowns: {}, procRoll: 0,
    combatPattern: smartDefaultPatternFromEquipped([id]), applyProcInPattern: true,
    attacker: { atk: 100, magicAtk: 100, str: 60, int: 60, def: 100, spi: 100, currentHp: 200, maxHp: 1000, mp: 10000, maxMp: 10000, selfBuffs: {}, selfDebuffs: {} },
    target: { def: 40, magicDef: 40, selfBuffs: {}, selfDebuffs: {} } };
}
const player: PlayerCombat = { hp: 2000, maxHp: 10000, mp: 10000, maxMp: 10000, atk: 100, magicAtk: 100, strStat: 60, intStat: 60, spiStat: 100, def: 100, spd: 100, evasionPct: 0, accuracyPct: 100, attackCount: 1 };
afterEach(() => vi.restoreAllMocks());

describe("7차 신규 패키지 실제 전투", () => {
  it("이지스는 방어와 정신을 각각 공격에 활용한다", () => {
    const args = input(strike);
    const base = resolveV2SkillCast(args);
    expect(base.castSkillId).toBe(strike);
    expect(base.enemyDamage).toBeGreaterThan(0);
    expect(resolveV2SkillCast({ ...args, attacker: { ...args.attacker, def: 300 } }).enemyDamage).toBeGreaterThan(base.enemyDamage);
    expect(resolveV2SkillCast({ ...args, attacker: { ...args.attacker, spi: 300 } }).enemyDamage).toBeGreaterThan(base.enemyDamage);
  });
  it("이지스는 보호막을 전개하고 세라핌은 피해와 자기 회복을 함께 처리한다", () => {
    expect(resolveV2SkillCast(input(barrier)).shieldToApply?.hp).toBeGreaterThan(0);
    const shielded = input(barrier);
    shielded.attacker.selfShieldActive = true;
    expect(resolveV2SkillCast(shielded).castSkillId).toBeNull();
    const result = resolveV2SkillCast(input(judgment));
    expect(result.enemyDamage).toBeGreaterThan(0);
    expect(result.selfHeal).toBeGreaterThan(0);
    const recovery = resolveV2SkillCast(input(wings));
    expect(recovery.selfHeal).toBeGreaterThan(0);
    expect(recovery.shieldToApply?.hp).toBeGreaterThan(0);
    const fullHp = input(wings);
    fullHp.attacker.currentHp = 1000;
    expect(resolveV2SkillCast(fullHp).castSkillId).toBeNull();
  });
  it("드래곤로드는 물리 공격과 마법·연소를 독립적으로 시전한다", () => {
    expect(resolveV2SkillCast(input(claw)).enemyDamage).toBeGreaterThan(0);
    const cast = resolveV2SkillCast(input(breath));
    expect(cast.enemyDamage).toBeGreaterThan(0);
    expect(cast.dotsToApplyToTarget).toEqual([expect.objectContaining({ tag: "burn" })]);
  });
  it.each([strike, barrier, judgment, wings, claw, breath])("%s는 MP 부족 시 효과를 만들지 않는다", (id) => {
    const args = input(id);
    args.attacker.mp = 0;
    const cast = resolveV2SkillCast(args);
    expect(cast.castSkillId).toBeNull();
    expect(cast.enemyDamage).toBe(0);
    expect(cast.selfHeal).toBe(0);
    expect(cast.shieldToApply).toBeUndefined();
    expect(cast.dotsToApplyToTarget).toEqual([]);
  });
  it("PvE에서 세라핌 회복과 드래곤로드 연소를 실제 전투 상태에 반영한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const enemy = { name: "허수아비", tags: [], hp: 10000, atk: 1, def: 0, spd: 1, exp: 0, drops: [] };
    for (const id of [judgment, breath]) {
      const state = initialBattleState(player, enemy, "7차", skills(id));
      const cast = applyPlayerV2SkillCast(state, player, { selfBuffs: {}, selfDebuffs: {}, enemyDebuffs: {} });
      expect(cast.state.enemyHp).toBeLessThan(10000);
      if (id === breath) expect(cast.state.enemyV2Dots).toEqual([expect.objectContaining({ tag: "burn" })]);
      else expect(cast.state.playerHp).toBeGreaterThan(2000);
    }
  });
  it.each(["p1", "p2"] as const)("PvP %s에서도 세 직업의 공격과 부가 효과를 적용한다", (who) => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const other = who === "p1" ? "p2" : "p1";
    for (const id of [strike, judgment, breath]) {
      const state = initialBattleStatePvP(player, player, "A", "B", skills(id), skills(id));
      const cast = castV2SkillOnAttackerTurnPvP(state, who);
      expect(cast.state[other].hp).toBeLessThan(2000);
      if (id === judgment) expect(cast.state[who].hp).toBeGreaterThan(2000);
      if (id === breath) expect(cast.state[other].v2Dots).toEqual([expect.objectContaining({ tag: "burn" })]);
    }
  });
  it.each([barrier, wings])("%s 보호막은 PvE와 PvP 양측에서 실제 피해를 흡수할 상태로 저장된다", (id) => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const enemy = { name: "허수아비", tags: [], hp: 10000, atk: 1, def: 0, spd: 1, exp: 0, drops: [] };
    const pve = applyPlayerV2SkillCast(initialBattleState(player, enemy, "7차", skills(id)), player, { selfBuffs: {}, selfDebuffs: {}, enemyDebuffs: {} });
    expect(pve.state.stacks.playerShield).toBeGreaterThan(0);
    for (const who of ["p1", "p2"] as const) {
      const pvp = castV2SkillOnAttackerTurnPvP(initialBattleStatePvP(player, player, "A", "B", skills(id), skills(id)), who);
      expect(pvp.state[who].stacks.playerShield).toBeGreaterThan(0);
      if (id === wings) expect(pvp.state[who].hp).toBeGreaterThan(2000);
    }
  });
});
