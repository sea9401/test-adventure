import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveV2SkillCast, type V2SkillCastInput } from "./combatShared";
import { initialBattleState, applyPlayerV2SkillCast, type PlayerCombat } from "./engine";
import { initialBattleStatePvP, castV2SkillOnAttackerTurnPvP } from "./engine-pvp";
import { smartDefaultPatternFromEquipped, type V2SkillId, type V2SkillsState } from "@/adventure/data/v2/v2Skills";

const fang = "v2c_dragonknight_fang";
const roar = "v2c_drakeblood_roar";
const assault = "v2c_dragonwing_assault";
const breath = "v2c_dragonsovereign_breath";
const skills = (id: V2SkillId): V2SkillsState => ({ learned: [id], equipped: [id] });
function input(id: V2SkillId, patterned = false): V2SkillCastInput {
  return {
    skills: skills(id), cooldowns: {}, procRoll: 0,
    ...(patterned ? { combatPattern: smartDefaultPatternFromEquipped([id]), applyProcInPattern: true } : {}),
    attacker: { atk: 100, str: 30, vit: 20, mp: 10000, maxHp: 1000, selfBuffs: {}, selfDebuffs: {} },
    target: { def: 40, selfBuffs: {}, selfDebuffs: {} },
  };
}
const player: PlayerCombat = { hp: 1000, maxHp: 1000, mp: 10000, maxMp: 10000, atk: 100, strStat: 30, vitStat: 20, def: 0, spd: 100, evasionPct: 0, accuracyPct: 100, attackCount: 1 };
afterEach(() => vi.restoreAllMocks());

describe("용기사의 서로 다른 전투 역할", () => {
  it.each([false, true])("패턴 %s: 관통 추가분은 적 방어력으로 줄지 않는다", patterned => {
    const args = input(fang, patterned);
    // 공통 피해 공식의 단계별 정수 내림으로 표시 계수 대비 1의 오차를 허용한다.
    expect(Math.abs(resolveV2SkillCast(args).enemyDamage - 196)).toBeLessThanOrEqual(1);
    args.target.def = 1000;
    // 본타 최소 1 + 방어 전 189의 25% 내림.
    expect(resolveV2SkillCast(args).enemyDamage).toBe(48);
  });
  it("기본 패턴은 포효 버프가 남아 있으면 반복 시전하지 않는다", () => {
    const args = input(roar, true);
    const cast = resolveV2SkillCast(args);
    expect(cast.enemyDamage).toBe(0);
    expect(cast.selfBuffsToApply).toEqual([{ stat: "str", pct: 20, turns: 3 }]);
    expect(cast.enemyDamageDownToApply).toEqual({ pct: 15, turns: 3 });
    args.attacker.selfBuffs = { str: { pct: 20, turns: 2 } };
    expect(resolveV2SkillCast(args).castSkillId).toBeNull();
  });
  it("강습은 강한 물리 일격 뒤 다음 행동을 지연한다", () => {
    const cast = resolveV2SkillCast(input(assault, true));
    expect(cast.enemyDamage).toBe(240);
    expect(cast.enemyDelayToApply).toEqual({ pct: 35 });
  });
  it("6차 브레스는 공격력 3배와 활력 4.37배를 함께 사용한다", () => {
    const args = input(breath, true);
    expect(resolveV2SkillCast(args).enemyDamage).toBe(347);
    args.attacker.vit = 120;
    expect(resolveV2SkillCast(args).enemyDamage).toBe(784);
    args.attacker.mp = 0;
    expect(resolveV2SkillCast(args).castSkillId).toBeNull();
  });
  it("PvE에서 포효 강화·약화를 실제 상태에 반영한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const enemy = { name: "허수아비", tags: [], hp: 10000, atk: 1, def: 0, spd: 1, exp: 0, drops: [] };
    const initial = initialBattleState(player, enemy, "용기사", skills(roar));
    const cast = applyPlayerV2SkillCast(initial, player, { selfBuffs: {}, selfDebuffs: {}, enemyDebuffs: {} });
    // 시전 행동 종료에서 한 번 차감하므로 상태 저장은 표시 지속시간 +1.
    expect(cast.state.v2SelfBuffs.str).toEqual({ pct: 20, turns: 4 });
    expect(cast.state.stacks).toMatchObject({ enemyDamageDownPct: 15, enemyDamageDownTurns: 3 });
  });
  it.each(["p1", "p2"] as const)("PvP %s에서도 포효와 강습이 적용된다", who => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const other = who === "p1" ? "p2" : "p1";
    const initial = initialBattleStatePvP(player, player, "A", "B", skills(roar), skills(roar));
    const cast = castV2SkillOnAttackerTurnPvP(initial, who);
    expect(cast.state[who].v2SelfBuffs.str).toEqual({ pct: 20, turns: 4 });
    expect(cast.state[other].stacks).toMatchObject({ damageDownPct: 15, damageDownTurns: 3 });
    const strike = initialBattleStatePvP(player, player, "A", "B", skills(assault), skills(assault));
    expect(castV2SkillOnAttackerTurnPvP(strike, who).enemyDelayPct).toBe(35);
  });
});
