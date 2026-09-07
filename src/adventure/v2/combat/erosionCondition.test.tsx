import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { V2SkillsState } from "@/adventure/data/v2/v2Skills";
import { ConditionParams } from "../V2CombatPatternView";
import { arenaPatternConditionSummary } from "@/adventure/data/v2/arenaLoadout";
import { parseCombatPattern, type V2CombatPattern } from "./combatPattern";
import { initialBattleState, applyPlayerV2SkillCast, type PlayerCombat } from "./engine";
import { initialBattleStatePvP, castV2SkillOnAttackerTurnPvP } from "./engine-pvp";

const skillId = "v2c_warrior_strike";
const player: PlayerCombat = {
  hp: 1000, maxHp: 1000, atk: 30, def: 6, spd: 30,
  evasionPct: 0, attackCount: 1, accuracyPct: 100, maxMp: 1000, mp: 1000,
};
function skills(active: boolean): V2SkillsState & { pattern: V2CombatPattern } {
  const pattern: V2CombatPattern = { blocks: [{
    condition: { kind: "enemy_debuff", target: "dotVulnerability", active },
    action: { kind: "skill", skillId },
  }] };
  return { learned: [skillId], equipped: [skillId], pattern };
}

describe("침식 전투 패턴 (#607)", () => {
  it.each([true, false])("저장 및 화면 요약에서 활성 조건 %s 유지", (active) => {
    const pattern = skills(active).pattern;
    expect(parseCombatPattern(JSON.parse(JSON.stringify(pattern)))).toEqual(pattern);
    const condition = pattern.blocks[0].condition;
    expect(arenaPatternConditionSummary(condition)).toContain("지속/저주 피해 증가(침식)");
    expect(renderToStaticMarkup(<ConditionParams condition={condition} onChange={() => {}} />))
      .toContain("지속/저주 피해 증가(침식)");
  });

  it.each([0, 1, 3])("PvE 남은 행동 %i회에 따라 있음/없음 조건 판정", (turns) => {
    for (const active of [true, false]) {
      const state = initialBattleState(player, {
        name: "허수아비", tags: [], hp: 10000, atk: 1, def: 0, spd: 1, exp: 0, evasionPct: 0,
      }, "테스터", skills(active));
      state.stacks.enemyDotVulnPct = 28;
      state.stacks.enemyDotVulnTurns = turns;
      const out = applyPlayerV2SkillCast(state, player,
        { selfBuffs: {}, selfDebuffs: {}, enemyDebuffs: {} }, "테스터");
      expect(out.castFired).toBe(active === (turns > 0));
    }
  });

  it.each(["p1", "p2"] as const)("PvP %s는 자신의 침식이 아닌 상대의 침식을 판정", (attacker) => {
    const opponent = attacker === "p1" ? "p2" : "p1";
    for (const turns of [0, 1, 3]) {
      for (const active of [true, false]) {
        const state = initialBattleStatePvP(player, player, "P1", "P2", skills(active), skills(active));
        state[attacker].stacks.dotVulnPct = 28;
        state[attacker].stacks.dotVulnTurns = turns > 0 ? 0 : 3;
        state[opponent].stacks.dotVulnPct = 28;
        state[opponent].stacks.dotVulnTurns = turns;
        expect(castV2SkillOnAttackerTurnPvP(state, attacker).castFired).toBe(active === (turns > 0));
      }
    }
  });
});
