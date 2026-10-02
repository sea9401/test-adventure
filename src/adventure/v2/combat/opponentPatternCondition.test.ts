import { describe, expect, it } from "vitest";
import type { V2SkillId, V2SkillsState } from "@/adventure/data/v2/v2Skills";
import { V2_SKILLS } from "@/adventure/data/v2/v2Skills";
import { initialBattleStatePvP, castV2SkillOnAttackerTurnPvP } from "./engine-pvp";
import type { PlayerCombat } from "./engine";

const magicGuard = "v2c_mage_fireball" as V2SkillId;
const physicalGuard = "v2c_warrior_strike" as V2SkillId;
const base: PlayerCombat = {
  hp: 10000, maxHp: 10000, maxMp: 1000, mp: 1000,
  atk: 80, magicAtk: 80, def: 20, spd: 30,
  evasionPct: 0, accuracyPct: 100, attackCount: 1,
  skillProcChanceAdd: 100,
};
const skills: V2SkillsState = {
  learned: [magicGuard, physicalGuard],
  equipped: [magicGuard, physicalGuard],
  pattern: { blocks: [
    { condition: { kind: "all", conditions: [
      { kind: "enemy_weapon", weaponType: "staff" },
      { kind: "enemy_max_mp", op: "atLeast", value: 500 },
    ] }, action: { kind: "skill", skillId: magicGuard } },
    { condition: { kind: "always" }, action: { kind: "skill", skillId: physicalGuard } },
  ] },
};

function castAgainst(opponent: Partial<PlayerCombat>, who: "p1" | "p2") {
  const caster = { ...base, weaponType: "dagger" as const };
  const target = { ...base, ...opponent };
  const state = who === "p1"
    ? initialBattleStatePvP(caster, target, "P1", "P2", skills)
    : initialBattleStatePvP(target, caster, "P1", "P2", undefined, skills);
  state[who === "p1" ? "p2" : "p1"].mp = 1;
  return castV2SkillOnAttackerTurnPvP(state, who);
}

describe("상대 전투 세팅 조건 (#722)", () => {
  it.each(["p1", "p2"] as const)("%s는 상대의 무기와 최대 MP를 읽고 현재 MP 소모에 영향받지 않는다", (who) => {
    const result = castAgainst({ weaponType: "staff", maxMp: 500 }, who);
    expect(result.castFired).toBe(true);
    expect(result.state.log.some((entry) => entry.text.includes(V2_SKILLS[magicGuard].name))).toBe(true);
    expect(result.state.log.some((entry) => entry.text.includes(V2_SKILLS[physicalGuard].name))).toBe(false);
  });

  it.each([
    { weaponType: "staff" as const, maxMp: 499 },
    { weaponType: "bow" as const, maxMp: 900 },
    { maxMp: 900 },
  ])("상대 정보가 기준에 맞지 않으면 다음 패턴 블록을 고른다: %j", (opponent) => {
    const result = castAgainst(opponent, "p1");
    expect(result.castFired).toBe(true);
    expect(result.state.log.some((entry) => entry.text.includes(V2_SKILLS[physicalGuard].name))).toBe(true);
    expect(result.state.log.some((entry) => entry.text.includes(V2_SKILLS[magicGuard].name))).toBe(false);
  });
});
