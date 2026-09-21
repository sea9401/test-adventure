import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { V2SkillId, V2SkillsState } from "@/adventure/data/v2/v2Skills";
import { arenaPatternConditionSummary } from "@/adventure/data/v2/arenaLoadout";
import { COMBAT_PATTERN_CONDITION_OPTIONS, ConditionParams } from "../V2CombatPatternView";
import { parseCombatPattern, parseCombatPresets, type V2CombatPattern } from "./combatPattern";
import { initialBattleState, applyPlayerV2SkillCast, type PlayerCombat } from "./engine";
import { initialBattleStatePvP, castV2SkillOnAttackerTurnPvP } from "./engine-pvp";
import type { FormulaState } from "./primordialSageCombat";

const orb = "v2c_primordialsage_greatorb";
const core = "v2c_primordialsage_completeformula";
const optimization = "v2c_primordialsage_optimization";
const fireball = "v2c_mage_fireball";
const surge = "v2c_elementallord_surge";
const player: PlayerCombat = {
  hp: 1000, maxHp: 1000, atk: 30, magicAtk: 100, def: 6, spd: 30,
  evasionPct: 0, attackCount: 1, accuracyPct: 100, maxMp: 1000, mp: 1000,
  skillProcChanceAdd: 100,
};
const enemy = {
  name: "허수아비", tags: [], hp: 100000, atk: 1, def: 0, spd: 1, exp: 0, evasionPct: 0,
};
function skills(active: boolean, skillId: V2SkillId = orb, passives: V2SkillId[] = [core]): V2SkillsState & { pattern: V2CombatPattern } {
  return {
    learned: [skillId, ...passives], equipped: [skillId, ...passives],
    pattern: { blocks: [{ condition: { kind: "formula_completion", active }, action: { kind: "skill", skillId } }] },
  };
}
const ready: FormulaState = { stages: 2, seenSkillIds: [fireball, "v2c_archmage_collapse"] };
const cases: { name: string; formula: FormulaState; skillId: V2SkillId; passives: V2SkillId[]; completes: boolean }[] = [
  { name: "빈 주기", formula: { stages: 0, seenSkillIds: [] }, skillId: orb, passives: [core], completes: false },
  { name: "1단계 일반 주문", formula: { stages: 1, seenSkillIds: [fireball] }, skillId: orb, passives: [core], completes: false },
  { name: "2단계 새 주문, 최적화 미장착", formula: ready, skillId: orb, passives: [core], completes: true },
  { name: "2단계 중복 주문", formula: ready, skillId: fireball, passives: [core], completes: false },
  { name: "1단계 오원소 주문", formula: { stages: 1, seenSkillIds: [fireball] }, skillId: surge, passives: [core], completes: true },
  { name: "완전식 미장착", formula: ready, skillId: orb, passives: [], completes: false },
  { name: "물리 주문", formula: ready, skillId: "v2c_warrior_strike", passives: [core], completes: false },
];
const ticked = { selfBuffs: {}, selfDebuffs: {}, enemyDebuffs: {} };

describe("완전식 발동 조건 (#693)", () => {
  it.each([true, false])("저장과 프리셋 왕복 및 화면에서 조건 %s 유지", (active) => {
    const pattern = skills(active).pattern;
    expect(parseCombatPattern(JSON.parse(JSON.stringify(pattern)))).toEqual(pattern);
    const presets = [{ name: "완전식", pattern }];
    expect(parseCombatPresets(JSON.parse(JSON.stringify(presets)))).toEqual(presets);
    expect(COMBAT_PATTERN_CONDITION_OPTIONS.some((option) => option.value === "formula_completion")).toBe(true);
    const condition = pattern.blocks[0].condition;
    expect(arenaPatternConditionSummary(condition)).toContain(active ? "완전식 발동" : "완전식 미발동");
    const html = renderToStaticMarkup(<ConditionParams condition={condition} onChange={() => {}} />);
    expect(html).toContain("발동할 때");
    expect(html).toContain("발동하지 않을 때");
  });

  it.each([undefined, "true", 1, null])("잘못된 활성 값 %s는 저장하지 않는다", (active) => {
    expect(parseCombatPattern({ blocks: [{ condition: { kind: "formula_completion", active }, action: { kind: "skill", skillId: orb } }] })).toEqual({ blocks: [] });
  });

  it.each(cases)("PvE $name", ({ formula, skillId, passives, completes }) => {
    for (const active of [true, false]) {
      const state = initialBattleState(player, enemy, "테스터", skills(active, skillId, passives));
      state.stacks.tier7 = { formula };
      const out = applyPlayerV2SkillCast(state, player, ticked, "테스터");
      expect(out.castFired).toBe(active === completes);
      expect(out.state.log.some((entry) => entry.text.includes("[완전식]"))).toBe(active && completes);
      if (active && completes) {
        expect(out.state.stacks.tier7?.formula).toEqual({ stages: 0, seenSkillIds: [] });
        expect(applyPlayerV2SkillCast(out.state, player, ticked, "테스터").castFired).toBe(false);
      }
    }
  });

  it.each(["p1", "p2"] as const)("PvP %s는 공격자 주문식으로 판정한다", (attacker) => {
    const opponent = attacker === "p1" ? "p2" : "p1";
    for (const { formula, skillId, passives, completes } of cases) {
      for (const active of [true, false]) {
        const loadout = skills(active, skillId, passives);
        const state = initialBattleStatePvP(player, player, "P1", "P2", loadout, loadout);
        state[attacker].stacks.tier7 = { formula };
        state[opponent].stacks.tier7 = { formula: completes ? { stages: 0, seenSkillIds: [] } : ready };
        const out = castV2SkillOnAttackerTurnPvP(state, attacker);
        expect(out.castFired).toBe(active === completes);
        expect(out.state.log.some((entry) => entry.text.includes("[완전식]"))).toBe(active && completes);
      }
    }
  });

  it.each([false, true])("MP 부족 허용은 최적화 장착 %s에 따른다", (optimized) => {
    const loadout = skills(true, orb, optimized ? [core, optimization] : [core]);
    const state = initialBattleState(player, enemy, "테스터", loadout);
    state.stacks.tier7 = { formula: ready };
    state.playerMp = 0;
    expect(applyPlayerV2SkillCast(state, player, ticked, "테스터").castFired).toBe(optimized);
    const pvp = initialBattleStatePvP(player, player, "P1", "P2", loadout, loadout);
    pvp.p1.stacks.tier7 = { formula: ready };
    pvp.p1.mp = 0;
    expect(castV2SkillOnAttackerTurnPvP(pvp, "p1").castFired).toBe(optimized);
  });

  it("완전식 조건이 맞아도 재사용 대기 중이면 시전하지 않는다", () => {
    const state = initialBattleState(player, enemy, "테스터", skills(true));
    state.stacks.tier7 = { formula: ready };
    state.v2SkillCooldowns[orb] = 10;
    expect(applyPlayerV2SkillCast(state, player, ticked, "테스터").castFired).toBe(false);
  });
});
