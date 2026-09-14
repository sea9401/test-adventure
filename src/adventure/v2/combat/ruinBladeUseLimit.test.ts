import { afterEach, describe, expect, it, vi } from "vitest";
import { describeV2Skill, spCostOf, V2_SKILLS, type V2SkillsState } from "@/adventure/data/v2/v2Skills";
import { applyPlayerV2SkillCast, initialBattleState, type PlayerCombat } from "./engine";
import { castV2SkillOnAttackerTurnPvP, initialBattleStatePvP } from "./engine-pvp";

const skills: V2SkillsState = {
  learned: ["v2c_ruinblade_ruinsword", "v2c_ruinblade_limitstrike", "v2c_ruinblade_oneintent"],
  equipped: ["v2c_ruinblade_ruinsword", "v2c_ruinblade_limitstrike", "v2c_ruinblade_oneintent"],
};
const player: PlayerCombat = {
  hp: 350_000, maxHp: 1_000_000, atk: 100, strStat: 100, def: 0,
  spd: 100, accuracyPct: 100, evasionPct: 0, attackCount: 1,
  mp: 100_000, maxMp: 100_000,
};
const buffs = { selfBuffs: {}, selfDebuffs: {}, enemyDebuffs: {} };
const chargeText = "[멸검] 검의 3개를 소모해 충전을 시작했다";
const releaseText = "[멸검] 충전을 해방";

afterEach(() => vi.restoreAllMocks());

describe("멸검 전투당 3회", () => {
  it("SP 24를 유지하며 실제 제한을 스킬 설명에 표시한다", () => {
    const skill = V2_SKILLS.v2c_ruinblade_ruinsword;
    expect(spCostOf(skill)).toBe(24);
    expect(describeV2Skill(skill)).toContain("전투당 3회");
    expect(describeV2Skill(skill)).not.toContain("전투당 1회");
  });

  it("PvE에서 세 번 모두 해방하고 네 번째 충전은 막으며 새 전투에서 다시 사용한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    for (let battle = 0; battle < 2; battle += 1) {
      let state = initialBattleState(player, {
        name: "허수아비", tags: [], hp: 10_000_000, atk: 0, def: 0, spd: 1, exp: 0,
      }, "멸검제", skills);
      for (let action = 0; action < 25; action += 1) {
        state = applyPlayerV2SkillCast(state, player, buffs).state;
      }
      expect(state.log.filter(e => e.text.includes(chargeText))).toHaveLength(3);
      expect(state.log.filter(e => e.text.includes(releaseText))).toHaveLength(3);
      expect(state.stacks.tier7?.ruinCharge).toBeUndefined();
      expect(state.stacks.tier7?.swordIntent).toBe(3);
    }
  });

  it("PvP에서 양쪽의 사용 횟수를 독립적으로 제한하고 세 번째 해방까지 허용한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    let state = initialBattleStatePvP(player, player, "P1", "P2", skills, skills);
    for (const side of ["p1", "p2"] as const) {
      for (let action = 0; action < 25; action += 1) {
        state = castV2SkillOnAttackerTurnPvP(state, side).state;
      }
      const log = state.log.filter(e => e.side === side);
      expect(log.filter(e => e.text.includes(chargeText))).toHaveLength(3);
      expect(log.filter(e => e.text.includes(releaseText))).toHaveLength(3);
      expect(state[side].stacks.tier7?.ruinCharge).toBeUndefined();
      expect(state[side].stacks.tier7?.swordIntent).toBe(3);
    }
  });
});
