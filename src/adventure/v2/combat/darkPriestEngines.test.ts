import { afterEach, describe, expect, it, vi } from "vitest";
import { initialBattleState, applyPlayerV2SkillCast, finishPlayerTurn, type PlayerCombat } from "./engine";
import { initialBattleStatePvP, castV2SkillOnAttackerTurnPvP, endAttackerPhase } from "./engine-pvp";
import type { V2SkillId, V2SkillsState } from "@/adventure/data/v2/v2Skills";
const player: PlayerCombat = { hp: 5000, maxHp: 10000, mp: 10000, maxMp: 10000, atk: 100, lukStat: 50, def: 0, spd: 100, evasionPct: 0, accuracyPct: 100, attackCount: 1, healMult: 1 };
const enemy = { name: "허수아비", tags: [], hp: 10000, atk: 100, def: 0, spd: 1, exp: 0, drops: [] };
const skills = (id: V2SkillId): V2SkillsState => ({ learned: [id, "v2c_darkpriest_blessing"], equipped: [id, "v2c_darkpriest_blessing"], pattern: { blocks: [{ condition: { kind: "always" }, action: { kind: "skill", skillId: id } }] } });
afterEach(() => vi.restoreAllMocks());
describe("고통 엔진 연결", () => {
  it("PvE 사죄가 고통을 소비하고 독립 HP 회복을 적용한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    let state = initialBattleState(player, enemy, "사제", skills("v2c_confessor_absolution"));
    expect(state.stacks.pain?.debt).toBe(0);
    state = { ...state, stacks: { ...state.stacks, pain: { ...state.stacks.pain!, debt: 1200 } } };
    state = applyPlayerV2SkillCast(state, player, { selfBuffs: {}, selfDebuffs: {}, enemyDebuffs: {} }).state;
    expect(state.stacks.pain?.debt).toBe(400);
    expect(state.playerHp).toBe(5400);
    expect(finishPlayerTurn(state, player, "사제").playerHp).toBe(5000);
  });
  it.each(["p1", "p2"] as const)("PvP %s에서 MP 부족은 자원을 소비하지 않고 성역은 종료 정산한다", who => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const other = who === "p1" ? "p2" : "p1";
    let state = initialBattleStatePvP(player, player, "A", "B", skills("v2c_darksaint_sanctuary"), skills("v2c_darksaint_sanctuary"));
    expect(state[who].stacks.pain).toBeDefined();
    state = { ...state, [who]: { ...state[who], stacks: { ...state[who].stacks, pain: { ...state[who].stacks.pain!, debt: 1200 } } } };
    const dry = { ...state, [who]: { ...state[who], mp: 0 } };
    expect(castV2SkillOnAttackerTurnPvP(dry, who).state[who].stacks.pain?.used).toBe(false);
    state = castV2SkillOnAttackerTurnPvP(state, who).state;
    expect(state[who].stacks.pain?.sanctuary).toBe(4);
    for (let i=0;i<4;i++) state=endAttackerPhase({ ...state, phase: who },who,other,{tickDefenderDots:false,skipOffensiveFollowups:true});
    expect(state[who].stacks.pain?.debt).toBe(0);
    expect(state[who].hp).toBe(3800);
  });
});

import { resolveEnemyPhase } from "./engine.enemyPhase";
import { advanceTurnPvP } from "./engine.pvpPhase";
import { resolveBattleAtb } from "./engine.atb";
import { resolveBattlePvPAtb } from "./engine.pvp-atb";
import { settlePainPve } from "./darkPriestAdapters";

describe("고통의 실제 피격과 행동 종료", () => {
  it.each([0, 10000])("PvE 기본 공격은 보호막 처리 이후의 HP 피해만 유예한다 (shield=%s)", shield => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const initial=initialBattleState(player,enemy,"사제",skills("v2c_darkpriest_reap"));
    const state={...initial, phase: "enemy" as const, stacks:{...initial.stacks,playerShield:shield}};
    const without={...state,stacks:{...state.stacks,pain:undefined}};
    const raw=resolveEnemyPhase(without,player,"사제",true);
    const hit=resolveEnemyPhase(state,player,"사제",true);
    const debt=hit.stacks.pain?.debt ?? 0;
    expect(player.hp-hit.playerHp+debt).toBe(player.hp-raw.playerHp);
    expect(debt).toBe(shield ? 0 : Math.floor((player.hp-raw.playerHp)*0.2));
  });
  it.each(["p1","p2"] as const)("PvP 기본 공격 %s는 저장량을 피해에 중복 집계하지 않는다",who=>{
    vi.spyOn(Math,"random").mockReturnValue(0.5);
    const other=who==="p1"?"p2":"p1";
    const s=initialBattleStatePvP(player,player,"A","B",skills("v2c_darkpriest_reap"),skills("v2c_darkpriest_reap"));
    const state={...s,phase:who};
    const raw=advanceTurnPvP({...state,[other]:{...state[other],stacks:{...state[other].stacks,pain:undefined}}},{kind:"attack"},{tickDefenderDots:false});
    const hit=advanceTurnPvP(state,{kind:"attack"},{tickDefenderDots:false});
    const debt=hit[other].stacks.pain?.debt??0;
    expect(player.hp-hit[other].hp+debt).toBe(player.hp-raw[other].hp);
    expect(debt).toBeGreaterThan(0);
  });
  it.each(["p1","p2"] as const)("PvP 다단 스킬 %s는 하나의 고통 상한을 공유한다",who=>{
    vi.spyOn(Math,"random").mockReturnValue(0);
    const other=who==="p1"?"p2":"p1";
    const strong={...player,atk:5000};
    let state=initialBattleStatePvP(strong,strong,"A","B",skills("v2c_warrior_flurry"),skills("v2c_warrior_flurry"));
    state={...state,[other]:{...state[other],hp:10000,stacks:{...state[other].stacks,pain:{...state[other].stacks.pain!,debt:1900}}}};
    const result=castV2SkillOnAttackerTurnPvP(state,who).state;
    expect(result[other].stacks.pain?.debt).toBe(2000);
    expect(result.log.filter(e=>"painEvent" in e && e.painEvent?.kind==="defer").reduce((sum,e)=>sum+("painEvent" in e ? e.painEvent?.amount??0:0),0)).toBe(100);
  });
  it("고통 상환은 보호막을 무시하고 불굴을 한 번만 발동한다",()=>{
    let state=initialBattleState({...player,enduranceActive:true},enemy,"사제",skills("v2c_darkpriest_reap"));
    state={...state,playerHp:100,stacks:{...state.stacks,playerShield:10000,pain:{...state.stacks.pain!,debt:1200}}};
    const first=settlePainPve(state,{...player,enduranceActive:true});
    expect(first.playerHp).toBe(1);
    expect(first.stacks.playerShield).toBe(10000);
    const last=settlePainPve(first,{...player,enduranceActive:true});
    expect(last.outcome).toBe("lose");
    expect(last.stacks.pain?.debt).toBe(200);
  });
  it("실제 PvE/협동전 ATB에서 고통 생성과 상환 및 자원 표시가 작동한다",()=>{
    vi.spyOn(Math,"random").mockReturnValue(0.5);
    const result=resolveBattleAtb(player,{...enemy,atk:1000,spd:200},"사제",{pickAction:()=>({kind:"attack"}),potions:{},forceAtbSkills:true,maxTurns:8,v2Skills:skills("v2c_darkpriest_reap")});
    expect(result.finalState.log.some(e=>"painEvent" in e && e.painEvent?.kind==="defer")).toBe(true);
    expect(result.finalState.log.some(e=>"painEvent" in e && e.painEvent?.kind==="repay")).toBe(true);
    expect(result.finalState.log.some(e=>e.kind==="hp_bar" && e.playerSignatureResources?.pain != null)).toBe(true);
  });
  it("PvP ATB의 정상 행동은 고통 상환을 중복하지 않는다",()=>{
    vi.spyOn(Math,"random").mockReturnValue(0.5);
    const result=resolveBattlePvPAtb({...player,atk:1000,spd:250},player,"A","B",{pickAction:()=>({kind:"attack"}),potions:{p1:{},p2:{}},v2Skills:{p2:{learned:["v2c_darkpriest_blessing"],equipped:["v2c_darkpriest_blessing"]}}});
    const repayments=result.finalState.log.filter(e=>"painEvent" in e && e.painEvent?.kind==="repay");
    expect(repayments.length).toBeGreaterThan(0);
    expect(new Set(repayments.map(e=>e.t)).size).toBe(repayments.length);
  });
});

import { tickPvPSideDotsOnAction } from "./engine-pvp";

describe("고통 의식 경계 조건", () => {
  it.each(["p1", "p2"] as const)("%s의 공격이 확정 회피되어도 고통 소비와 독립 회복은 유지된다", who => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const other = who === "p1" ? "p2" : "p1";
    let state = initialBattleStatePvP(player, player, "A", "B", skills("v2c_darkpriest_reap"), skills("v2c_darkpriest_reap"));
    state = { ...state, [who]: { ...state[who], stacks: { ...state[who].stacks, pain: { ...state[who].stacks.pain!, debt: 800 } } }, [other]: { ...state[other], stacks: { ...state[other].stacks, evadesRemaining: 1 } } };
    const result = castV2SkillOnAttackerTurnPvP(state, who).state;
    expect(result[other].hp).toBe(state[other].hp);
    expect(result[who].hp).toBe(state[who].hp + 100);
    expect(result[who].stacks.pain?.debt).toBe(400);
    expect(result.log.some(e => e.text.includes("HP 100 회복"))).toBe(true);
  });
  it("지속 피해와 자해는 고통을 새로 만들지 않는다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const state = initialBattleStatePvP(player, player, "A", "B", skills("v2c_blooddemon_reign"));
    state.p1.v2Dots = [{ tag: "poison", label: "중독", stacks: 1, maxStacks: 1, turns: 2, flatPerStack: 100, atkCoefPerStack: 0, pctMaxHpPerStack: 0, sourceAtk: 0 }];
    const dot = tickPvPSideDotsOnAction(state, "p1");
    expect(dot.p1.hp).toBeLessThan(state.p1.hp);
    expect(dot.p1.stacks.pain?.debt).toBe(0);
    const cast = castV2SkillOnAttackerTurnPvP(dot, "p1").state;
    expect(cast.p1.stacks.pain?.debt).toBe(0);
    expect(cast.log.some(e => e.text.includes("소모"))).toBe(true);
  });
  it("전투 종료 행동도 상환하고 다음 전투에는 부채를 넘기지 않는다", () => {
    let state = initialBattleState(player, enemy, "사제", skills("v2c_darkpriest_reap"));
    state = { ...state, phase: "ended", outcome: "win", playerHp: 100, stacks: { ...state.stacks, pain: { ...state.stacks.pain!, debt: 600, sanctuary: 1, used: true } } };
    expect(finishPlayerTurn(state, player, "사제").outcome).toBe("lose");
    expect(initialBattleState(player, enemy, "사제", skills("v2c_darkpriest_reap")).stacks.pain).toMatchObject({ debt: 0, sanctuary: 0, used: false, next: null });
  });
  it("시간 제한 판정은 표시 HP에서 부채를 뺀 비율을 사용한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const tank = { ...player, atk: 0, def: 100000, spd: 100 };
    const result = resolveBattlePvPAtb(tank, tank, "A", "B", {
      potions: { p1: {}, p2: {} },
      v2Skills: { p1: { learned: ["v2c_darkpriest_blessing"], equipped: ["v2c_darkpriest_blessing"] } },
      pickAction: state => {
        state.p1.hp = 8000;
        state.p2.hp = 7000;
        state.p1.stacks.pain = { ...state.p1.stacks.pain!, debt: 1800, sanctuary: 4 };
        return { kind: "attack" };
      },
    });
    expect(result.finalState.p1.hp).toBeGreaterThan(result.finalState.p2.hp);
    expect(result.outcome).toBe("p2_win");
  });
  it("감전으로 행동을 잃어도 성역의 마지막 행동은 정산한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const tank = { ...player, atk: 0, def: 100000, spd: 100 };
    let injected = false;
    const result = resolveBattlePvPAtb(tank, tank, "A", "B", {
      potions: { p1: {}, p2: {} },
      v2Skills: { p1: { learned: ["v2c_darkpriest_blessing"], equipped: ["v2c_darkpriest_blessing"] } },
      pickAction: (state, who) => {
        if (who === "p2" && !injected) {
          injected = true;
          state.p1.hp = 100;
          state.p1.stacks.pain = { ...state.p1.stacks.pain!, debt: 600, sanctuary: 1, used: true };
          state.p1.stacks.shockAction = "pending";
        }
        return { kind: "attack" };
      },
    });
    expect(result.outcome).toBe("p2_win");
    expect(result.finalState.log.some(e => e.text.includes("[감전]"))).toBe(true);
    expect(result.finalState.log.some(e => e.text.includes("[검은 성역 종료] HP 600"))).toBe(true);
  });
});

it("반사 피해는 고통으로 유예하지 않는다", () => {
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  const state = initialBattleStatePvP(player, { ...player, thornsPct: 100 }, "A", "B", skills("v2c_warrior_flurry"));
  state.phase = "p1";
  state.p1.stacks.pain = { ...state.p1.stacks.pain!, sanctuary: 3 };
  const hit = advanceTurnPvP(state, { kind: "attack" }, { tickDefenderDots: false });
  expect(hit.p1.hp).toBeLessThan(state.p1.hp);
  expect(hit.p1.stacks.pain?.debt).toBe(0);
});
it("회복 감소는 사죄의 HP 회복에만 적용되고 고통 해소량은 줄이지 않는다", () => {
  vi.spyOn(Math, "random").mockReturnValue(0);
  const reduced = { ...player, receivedHealMult: 0.5 };
  const state = initialBattleStatePvP(reduced, player, "A", "B", skills("v2c_confessor_absolution"));
  state.p1.stacks.pain = { ...state.p1.stacks.pain!, debt: 1200 };
  const cast = castV2SkillOnAttackerTurnPvP(state, "p1").state;
  expect(cast.p1.stacks.pain?.debt).toBe(400);
  expect(cast.p1.hp).toBe(state.p1.hp + 200);
});
