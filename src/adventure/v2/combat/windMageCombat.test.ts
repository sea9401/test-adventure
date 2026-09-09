import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialBattleState, applyPlayerV2SkillCast, type PlayerCombat } from "./engine";
import { initialBattleStatePvP, castV2SkillOnAttackerTurnPvP } from "./engine-pvp";
import { resolveBattleAtb } from "./engine.atb";
import { smartDefaultPatternFromEquipped, type V2SkillId, type V2SkillsState } from "@/adventure/data/v2/v2Skills";
import { derivePlayerCombatV2FromSaves } from "@/lib/server/derivePlayerCombatV2";
vi.mock("@/adventure/data/v2/coreLoopConfig", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/adventure/data/v2/coreLoopConfig")>();
  return { ...actual, V2_SKILL_PROC_IN_PATTERN: true };
});
const blade = "v2c_aeromancer_blade";
const burst = "v2c_stormbringer_burst";
const player: PlayerCombat = { hp: 10000, maxHp: 10000, mp: 10000, maxMp: 10000, atk: 100, magicAtk: 100, intStat: 100, def: 0, spd: 100, evasionPct: 0, accuracyPct: 100, attackCount: 1, windCurrentDamagePctPerStack: 20 };
const enemy = { name: "허수아비", tags: [], hp: 100000, atk: 1, def: 0, spd: 1, exp: 0, drops: [] };
const skills = (id: V2SkillId): V2SkillsState => ({ learned: [id], equipped: [id], pattern: { blocks: [{ condition: { kind: "always" }, action: { kind: "skill", skillId: id } }] } });
const castPve = (state: ReturnType<typeof initialBattleState>, actor = player) => applyPlayerV2SkillCast(state, actor, { selfBuffs: {}, selfDebuffs: {}, enemyDebuffs: {} });
beforeEach(() => vi.spyOn(Math, "random").mockReturnValue(0.1));
afterEach(() => vi.restoreAllMocks());

describe("바람 고차 전투", () => {
  it.each(["v2c_windmage_tempest", blade] as const)("%s는 기존 기류로 강화한 뒤 시전당 하나만 생성한다", id => {
    const initial = initialBattleState(player, enemy, "바람", skills(id));
    expect(initial.stacks.windCurrent).toBe(0);
    const first = castPve(initial);
    expect(first.castFired).toBe(true);
    expect(first.state.stacks.windCurrent).toBe(1);
    const second = castPve({...initial, stacks:{...initial.stacks, windCurrent:2}});
    expect(second.state.stacks.windCurrent).toBe(3);
    expect(initial.enemyHp - second.state.enemyHp).toBeCloseTo((initial.enemyHp - first.state.enemyHp) * 1.4, -1);
  });
  it("폭풍은 기류 3개에서 2.2배 피해·소비·45% 가속을 제공한다", () => {
    const initial = initialBattleState(player, enemy, "바람", skills(burst));
    const base = castPve(initial);
    const full = castPve({...initial, stacks:{...initial.stacks, windCurrent:3}});
    expect(base.selfHastePct).toBe(0);
    expect(full.selfHastePct).toBe(45);
    expect(full.state.stacks.windCurrent).toBe(0);
    expect(initial.enemyHp - full.state.enemyHp).toBeCloseTo((initial.enemyHp - base.state.enemyHp) * 2.2, -1);
  });
  it.each([blade, burst] as const)("%s는 MP 부족·발동실패 때 자원을 유지한다", id => {
    const initial = initialBattleState(player, enemy, "바람", skills(id));
    initial.stacks.windCurrent = 2;
    expect(castPve({...initial, playerMp:0}).state.stacks.windCurrent).toBe(2);
    vi.mocked(Math.random).mockReturnValue(0.99);
    expect(castPve(initial).state.stacks.windCurrent).toBe(2);
  });
  it("일반 마법은 기류를 소비하거나 강화하지 않으며 미장착이면 기류를 생성하지 않는다", () => {
    const initial = initialBattleState(player, enemy, "바람", skills("v2c_infernomancer_collapse"));
    const zero = castPve(initial);
    const full = castPve({...initial, stacks:{...initial.stacks, windCurrent:3}});
    expect(full.state.enemyHp).toBe(zero.state.enemyHp);
    expect(full.state.stacks.windCurrent).toBe(3);
    const plain = {...player, windCurrentDamagePctPerStack:undefined};
    expect(castPve(initialBattleState(plain, enemy, "바람", skills(blade)), plain).state.stacks.windCurrent).toBeUndefined();
  });
  it.each(["p1", "p2"] as const)("PvP %s의 생성·소비와 보호막 적중을 처리한다", who => {
    const other = who === "p1" ? "p2" : "p1";
    const initial = initialBattleStatePvP(player, player, "A", "B", skills(blade), skills(blade));
    const gathered = castV2SkillOnAttackerTurnPvP(initial, who);
    expect(gathered.state[who].stacks.windCurrent).toBe(1);
    initial[who].v2Skills = skills(burst);
    const base = castV2SkillOnAttackerTurnPvP(initial, who);
    initial[who].stacks.windCurrent = 3;
    const full = castV2SkillOnAttackerTurnPvP(initial, who);
    expect(full.state[who].stacks.windCurrent).toBe(0);
    expect(full.selfHastePct).toBe(45);
    expect(initial[other].hp - full.state[other].hp).toBeCloseTo((initial[other].hp - base.state[other].hp) * 2.2, -1);
    initial[other].stacks.playerShield = 100000;
    const shielded = castV2SkillOnAttackerTurnPvP(initial, who);
    expect(shielded.state[other].hp).toBe(initial[other].hp);
    expect(shielded.state[who].stacks.windCurrent).toBe(0);
    expect(shielded.selfHastePct).toBe(45);
  });
  it.each([blade, burst] as const)("PvP %s는 확정 회피·MP 부족·발동 실패 때 기류를 유지한다", id => {
    const initial = initialBattleStatePvP(player, player, "A", "B", skills(id), skills(id));
    initial.p1.stacks.windCurrent = 2;
    initial.p2.stacks.evadesRemaining = 1;
    const missed = castV2SkillOnAttackerTurnPvP(initial, "p1");
    expect(missed.state.p1.stacks.windCurrent).toBe(2);
    expect(missed.state.p2.hp).toBe(initial.p2.hp);
    if (id === burst) expect(missed.selfHastePct).toBe(0);
    initial.p2.stacks.evadesRemaining = 0;
    initial.p1.mp = 0;
    expect(castV2SkillOnAttackerTurnPvP(initial, "p1").state.p1.stacks.windCurrent).toBe(2);
    initial.p1.mp = 10000;
    vi.mocked(Math.random).mockReturnValue(0.99);
    expect(castV2SkillOnAttackerTurnPvP(initial, "p1").state.p1.stacks.windCurrent).toBe(2);
  });
  it("ATB 기본 패턴은 기류 3개를 모은 뒤 폭풍을 사용하고 자원을 표시한다", () => {
    const equipped: V2SkillId[] = [burst, blade];
    const result = resolveBattleAtb(player, enemy, "바람", { pickAction: () => ({kind:"attack"}), potions:{}, forceAtbSkills:true, maxTurns:8, v2Skills:{learned:equipped,equipped,pattern:smartDefaultPatternFromEquipped(equipped)} });
    expect(result.finalState.log.some(entry => entry.text.includes("템페스트 버스트!"))).toBe(true);
    expect(result.finalState.log.some(entry => entry.kind === "hp_bar" && entry.playerSignatureResources?.windCurrent === "3/3")).toBe(true);
  });
  it("저장된 장착 패시브를 서버 전투 스탯에 전달한다", () => {
    const ids: V2SkillId[] = ["v2c_aeromancer_current", "v2c_stormbringer_current"];
    const result = derivePlayerCombatV2FromSaves({character:{level:50,hp:500,mp:100,class:"mage"},equipmentSave:{owned:[],equipped:{}},proficiencyRaw:{},skillsRaw:{learned:ids,equipped:ids}});
    expect(result?.player.windCurrentDamagePctPerStack).toBe(20);
  });
});
