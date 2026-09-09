import { afterEach, describe, expect, it, vi } from "vitest";
import { initialBattleState, applyPlayerV2SkillCast, finishPlayerTurn, type PlayerCombat } from "./engine";
import { initialBattleStatePvP, castV2SkillOnAttackerTurnPvP, endAttackerPhase } from "./engine-pvp";
import type { V2SkillsState } from "@/adventure/data/v2/v2Skills";
import { resolveBattleAtb } from "./engine.atb";
const sanctuary = "v2c_radiantknight_verdict";
const judgment = "v2c_dawnpaladin_judgment";
const player: PlayerCombat = { hp: 500, maxHp: 1000, mp: 1000, maxMp: 1000, atk: 100, strStat: 30, spiStat: 20, def: 0, spd: 100, evasionPct: 0, accuracyPct: 100, attackCount: 1, healMult: 1.25 };
const skills = (id: typeof sanctuary | typeof judgment): V2SkillsState => ({ learned: [id], equipped: [id], pattern: { blocks: [{ condition: { kind: "always" }, action: { kind: "skill", skillId: id } }] } });
afterEach(() => vi.restoreAllMocks());

describe("성력 엔진 연동", () => {
  it("실제 ATB에서 기본 패턴으로 성역을 펼치고 성력 40을 모아 심판한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const equipped: V2SkillsState["equipped"] = [sanctuary, judgment];
    const result = resolveBattleAtb(player, { name: "허수아비", tags: [], hp: 10000, atk: 1, def: 0, spd: 1, exp: 0, drops: [] }, "성기사", {
      pickAction: () => ({ kind: "attack" }), potions: {}, forceAtbSkills: true, maxTurns: 8,
      v2Skills: { learned: equipped, equipped },
    });
    expect(result.finalState.log.some(entry => entry.text.includes("성력 40 소비"))).toBe(true);
    expect(result.finalState.log.some(entry => entry.kind === "hp_bar" && entry.playerSignatureResources?.holyPower === "40/100")).toBe(true);
  });
  it("PvE에서 성역 시전 후 자기 행동 4회만 회복하고 만피에도 성력을 얻는다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const enemy = { name: "허수아비", tags: [], hp: 10000, atk: 1, def: 0, spd: 1, exp: 0, drops: [] };
    let state = initialBattleState(player, enemy, "성기사", skills(sanctuary));
    state = applyPlayerV2SkillCast(state, player, { selfBuffs: {}, selfDebuffs: {}, enemyDebuffs: {} }).state;
    expect(state.stacks.holyPower?.sanctuaryTurns).toBe(4);
    expect(state.enemyHp).toBe(10000);
    for (let i = 0; i < 5; i++) state = finishPlayerTurn(state, player, "성기사");
    expect(state.playerHp).toBe(700);
    expect(state.stacks.holyPower).toEqual({ power: 40, sanctuaryTurns: 0 });
    state = { ...state, playerHp: 1000, stacks: { ...state.stacks, holyPower: { power: 95, sanctuaryTurns: 1 } } };
    expect(finishPlayerTurn(state, player, "성기사").stacks.holyPower?.power).toBe(100);
  });
  it.each(["p1", "p2"] as const)("PvP %s도 성역 행동 종료 회복과 자원 소모를 적용한다", (who) => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const other = who === "p1" ? "p2" : "p1";
    let state = initialBattleStatePvP(player, player, "A", "B", skills(sanctuary), skills(sanctuary));
    state = castV2SkillOnAttackerTurnPvP(state, who).state;
    expect(state[who].stacks.holyPower?.sanctuaryTurns).toBe(4);
    state = endAttackerPhase(state, who, other);
    expect(state[who].hp).toBe(550);
    expect(state[who].stacks.holyPower).toEqual({ power: 10, sanctuaryTurns: 3 });
    state = { ...state, phase: who, [who]: { ...state[who], v2Skills: skills(judgment), stacks: { ...state[who].stacks, holyPower: { power: 40, sanctuaryTurns: 3 } } } };
    const cast = castV2SkillOnAttackerTurnPvP(state, who).state;
    expect(cast[who].stacks.holyPower).toEqual({ power: 0, sanctuaryTurns: 3 });
    const dry = { ...state, [who]: { ...state[who], mp: 0 } };
    expect(castV2SkillOnAttackerTurnPvP(dry, who).state[who].stacks.holyPower?.power).toBe(40);
  });
});
