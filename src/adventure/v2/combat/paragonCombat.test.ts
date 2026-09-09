import { afterEach, describe, expect, it, vi } from "vitest";
import { applyPlayerV2SkillCast, initialBattleState, applyEnemyV2SkillCast, resolveBattle, type PlayerCombat } from "./engine";
import { resolvePlayerPhase } from "./engine.playerPhase";
import { initialBattleStatePvP, castV2SkillOnAttackerTurnPvP, advanceTurnPvP, resolveBattlePvP } from "./engine-pvp";
import { composeDuelistDeclaration } from "./duelistCombat";
import { V2_SKILLS, spCostOf, v2SkillMpCostValue, aggregateEquippedPassives, type V2SkillId, type V2SkillsState } from "@/adventure/data/v2/v2Skills";
import { V2_JOB_CATALOG } from "@/adventure/data/v2/v2JobCatalog";
import { resolveEnemyPhase } from "./engine.enemyPhase";
import { resolveV2SkillCast } from "./combatShared";
import { POTIONS } from "@/adventure/data/potions";
vi.mock("@/adventure/data/v2/coreLoopConfig", async (importOriginal) => ({...await importOriginal<typeof import("@/adventure/data/v2/coreLoopConfig")>(), V2_CORE_LOOP_V2:true, V2_ATB_SKILLS:true}));
const form = "v2c_paragon_form" as V2SkillId;
const point = "v2c_paragon_breakpoint" as V2SkillId;
const mastery = "v2c_paragon_mastery" as V2SkillId;
const skills = (...ids: V2SkillId[]): V2SkillsState => ({learned: ids, equipped: ids});
const player: PlayerCombat = {hp:10000,maxHp:10000,mp:10000,maxMp:10000,atk:100,def:0,spd:100,evasionPct:0,accuracyPct:100,attackCount:1,allStatTotal:600,strStat:100,vitStat:100,dexStat:100,intStat:100,spiStat:100,lukStat:100};
const enemy = {name:"인형",tags:[],hp:100000,atk:100,def:20,spd:1,exp:0,drops:[]};
const cast = (state: ReturnType<typeof initialBattleState>) => applyPlayerV2SkillCast(state,player,{selfBuffs:{},selfDebuffs:{},enemyDebuffs:{}});
afterEach(()=>vi.restoreAllMocks());
describe("파라곤",()=>{
 it("두 6차 계보의 직업과 세 스킬을 등록한다",()=>{
  expect(V2_JOB_CATALOG.paragon).toMatchObject({tier:7,unlock:{prereqs:{grandchampion:100000,absolute:100000}}});
  expect(V2_SKILLS[form]).toMatchObject({category:"buff",cooldown:8});
  expect(V2_SKILLS[mastery]?.category).toBe("passive");
 });
 it("선언 직후 추가 평타는 새 선언을 소비하고 추가 피해 상한을 적용한다",()=>{
  vi.spyOn(Math,"random").mockReturnValue(.999999);
  const result = cast(initialBattleState(player,enemy,"파라곤",skills(form,mastery)));
  expect(result.signatureExtraActions).toBe(1);
  expect(result.state.duelistBuff?.remainingBasicHits).toBe(6);
  const after = resolvePlayerPhase({...result.state,playerAttacksLeft:1},player,"파라곤",{kind:"attack"});
  expect(result.state.enemyHp-after.enemyHp).toBe(120); // 100+min(600*.15,100*.4)-20
  expect(after.duelistBuff).toMatchObject({remainingBasicHits:5,landedBasicHits:1});
 });
 it.each([true,false])("공격 스킬은 장착한 완성된 기량(%s)에만 연속 단계를 유지한다",equipped=>{
  vi.spyOn(Math,"random").mockReturnValue(0.1);
  const state=initialBattleState(player,enemy,"파라곤",skills(point,...(equipped?[mastery]:[])));
  state.duelistBuff={...composeDuelistDeclaration([form,"v2c_undefeated_momentum"],form)!,landedBasicHits:3};
  const result=cast(state);
  expect(result.castFired).toBe(true);
  expect(result.state.duelistBuff).toMatchObject({remainingBasicHits:6,landedBasicHits:equipped?3:0});
  expect(result.state.stacks.nextAttackDamageDownPct).toBe(30);
 });
 it.each(["p1","p2"] as const)("PvP %s도 선언 직후 평타를 예약한다",who=>{
  const state=initialBattleStatePvP(player,player,"A","B",skills(form,mastery),skills(form,mastery));
  const result=castV2SkillOnAttackerTurnPvP(state,who);
  expect(result.signatureExtraActions).toBe(1);
  expect(result.state[who].attacksLeft).toBe(1);
  expect(result.state[who].duelistBuff?.remainingBasicHits).toBe(6);
 });
});

describe("파라곤 회귀 경계",()=>{
 it("표시 MP·SP와 브레이크 포인트 피해 공식이 합의 수치와 같다",()=>{
  expect([form,point,mastery].map(id=>spCostOf(V2_SKILLS[id]))).toEqual([20,16,12]);
  expect([form,point,mastery].map(id=>v2SkillMpCostValue(V2_SKILLS[id]))).toEqual([90,150,0]);
  const result=resolveV2SkillCast({skills:skills(point),cooldowns:{},procRoll:0,attacker:{atk:100,allStatTotal:600,mp:10000,maxHp:10000,selfBuffs:{},selfDebuffs:{}},target:{def:20,selfBuffs:{},selfDebuffs:{}}});
  expect(result.enemyDamage).toBe(400);
  expect(aggregateEquippedPassives([mastery]).paragonMastery).toBe(true);
  expect(aggregateEquippedPassives([]).paragonMastery).toBeUndefined();
 });
 it("장착한 하위 선언만 합성하며 배우기만 한 패시브는 즉시 평타를 주지 않는다",()=>{
  const state=initialBattleState(player,enemy,"파라곤",{learned:[form,mastery,"v2c_grandchampion_hour"],equipped:[form]});
  const result=cast(state);
  expect(result.signatureExtraActions).toBe(0);
  expect(result.state.duelistBuff).toMatchObject({chainCount:1,basicCritChanceCap:75,basicCritMultAdd:0});
 });
 it("하위 선언도 완성된 기량의 즉시 평타를 받는다",()=>{
  expect(cast(initialBattleState(player,enemy,"파라곤",skills("v2c_undefeated_momentum",mastery))).signatureExtraActions).toBe(1);
 });
 it("MP가 부족하면 선언과 추가 평타가 발생하지 않는다",()=>{
  const state=initialBattleState(player,enemy,"파라곤",skills(form,mastery));
  state.playerMp=0;
  const result=cast(state);
  expect(result.signatureExtraActions).toBe(0);
  expect(result.state.duelistBuff).toBeFalsy();
 });
 it("물약은 완성된 기량을 장착해도 연속 단계를 초기화한다",()=>{
  const state=cast(initialBattleState(player,enemy,"파라곤",skills(form,mastery))).state;
  state.duelistBuff={...state.duelistBuff!,landedBasicHits:3};
  const after=resolvePlayerPhase({...state,playerAttacksLeft:1},player,"파라곤",{kind:"use_potion",potionId:"potion_heal_s",potion:POTIONS.potion_heal_s});
  expect(after.duelistBuff).toMatchObject({remainingBasicHits:6,landedBasicHits:0});
 });
 it("PvE 약화는 다음 평타에 한 번 적용된다",()=>{
  vi.spyOn(Math,"random").mockReturnValue(.5);
  const state=initialBattleState(player,enemy,"파라곤");
  state.phase="enemy";
  state.stacks.nextAttackDamageDownPct=30;
  const after=resolveEnemyPhase(state,player,"파라곤",false);
  expect(state.playerHp-after.playerHp).toBe(70);
  expect(after.stacks.nextAttackDamageDownPct).toBe(0);
  const second=resolveEnemyPhase({...after,phase:"enemy",turn:{...after.turn,enemyAttacksLeft:1}},player,"파라곤",false);
  expect(after.playerHp-second.playerHp).toBe(100);
 });
 it("PvE 버프는 약화를 보존하고 직접 스킬은 적용 후 소비한다",()=>{
  vi.spyOn(Math,"random").mockReturnValue(.1);
  const state=initialBattleState(player,enemy,"파라곤");
  state.enemyMp=10000;state.enemyV2Skills=skills("v2c_drakeblood_roar");
  state.stacks.nextAttackDamageDownPct=30;
  const buff=applyEnemyV2SkillCast(state,player);
  expect(buff.castFired).toBe(true);
  expect(buff.state.stacks.nextAttackDamageDownPct).toBe(30);
  const ready={...state,enemyV2Skills:skills(point)};
  const normal=applyEnemyV2SkillCast({...ready,stacks:{...ready.stacks,nextAttackDamageDownPct:0}},player);
  const reduced=applyEnemyV2SkillCast(ready,player);
  expect(ready.playerHp-reduced.state.playerHp).toBe(Math.floor((ready.playerHp-normal.state.playerHp)*.7));
  expect(reduced.state.stacks.nextAttackDamageDownPct).toBe(0);
 });
 it.each(["p1","p2"] as const)("PvP %s 약화는 버프에는 남고 다단 직접 스킬 전체를 줄인다",who=>{
  vi.spyOn(Math,"random").mockReturnValue(.1);
  const other=who==="p1"?"p2":"p1";
  const state=initialBattleStatePvP(player,player,"A","B",skills(form),skills(form));
  state[who].stacks.nextAttackDamageDownPct=30;
  const buff=castV2SkillOnAttackerTurnPvP(state,who);
  expect(buff.state[who].stacks.nextAttackDamageDownPct).toBe(30);
  state[who].v2Skills=skills(point);state[who].attacksLeft=3;
  const reduced=castV2SkillOnAttackerTurnPvP(state,who);
  const normal=castV2SkillOnAttackerTurnPvP({...state,[who]:{...state[who],stacks:{...state[who].stacks,nextAttackDamageDownPct:0}}},who);
  expect(state[other].hp-reduced.state[other].hp).toBe(3 * Math.floor((state[other].hp-normal.state[other].hp) / 3 * .7));
  expect(reduced.state[who].stacks.nextAttackDamageDownPct).toBe(0);
  expect(reduced.state[other].stacks.nextAttackDamageDownPct).toBe(30);
 });
 it.each(["p1","p2"] as const)("PvP %s 기본 공격도 약화를 한 번 소비한다",who=>{
  vi.spyOn(Math,"random").mockReturnValue(.5);
  const other=who==="p1"?"p2":"p1";
  const state=initialBattleStatePvP(player,player,"A","B");
  state.phase=who;state[who].attacksLeft=1;state[who].stacks.nextAttackDamageDownPct=30;
  const after=advanceTurnPvP(state);
  expect(state[other].hp-after[other].hp).toBe(70);
  expect(after[who].stacks.nextAttackDamageDownPct).toBe(0);
 });
 it("PvP 보장 회피는 브레이크 포인트의 약화 부여를 막는다",()=>{
  vi.spyOn(Math,"random").mockReturnValue(.1);
  const state=initialBattleStatePvP(player,player,"A","B",skills(point));
  state.p2.stacks.evadesRemaining=1;
  const result=castV2SkillOnAttackerTurnPvP(state,"p1");
  expect(result.state.p2.stacks.nextAttackDamageDownPct??0).toBe(0);
 });
 it("PvE ATB에서 선언 직후 실제 평타를 실행한다",()=>{
  vi.spyOn(Math,"random").mockReturnValue(.5);
  const result=resolveBattle(player,{...enemy,hp:100},"파라곤",{pickAction:()=>({kind:"attack"}),potions:{},v2Skills:skills(form,mastery)});
  expect(result.finalState.enemyHp).toBe(0);
  const declaration=result.finalState.log.find(e=>"skillCast" in e && e.skillCast?.skillId===form);
  const firstHit=result.finalState.log.find(e=>e.kind==="player_attack");
  expect(declaration).toBeDefined();
  expect(firstHit?.t).toBe(declaration?.t);
  expect(result.finalState.log.some(e=>e.text.includes("남은 평타 5회"))).toBe(true);
 });
 it("PvP ATB에서 선언 직후 실제 평타를 실행한다",()=>{
  vi.spyOn(Math,"random").mockReturnValue(.5);
  const result=resolveBattlePvP(player,{...player,hp:100,maxHp:100,spd:1},"A","B",{pickAction:()=>({kind:"attack"}),potions:{p1:{},p2:{}},v2Skills:{p1:skills(form,mastery)}});
  expect(result.finalState.p2.hp).toBe(0);
  expect(result.finalState.p1.duelistBuff?.remainingBasicHits).toBe(5);
 });
});

describe("파라곤 효과 공존과 소비", () => {
  it("퍼펙트 폼은 상한 아래에서는 실제 능력치 합계만큼 더한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(.999999);
    const combatant = {...player, allStatTotal:100};
    const state = cast(initialBattleState(combatant, enemy, "파라곤", skills(form))).state;
    const after = resolvePlayerPhase({...state, playerAttacksLeft:1}, combatant, "파라곤", {kind:"attack"});
    expect(state.enemyHp - after.enemyHp).toBe(95); // ATK100 + 합계100 ×0.15 − DEF20
  });

  it("기존 쇠약과 공존하며 재적용은 30%로 갱신한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(.1);
    const state = initialBattleState(player, enemy, "파라곤", skills(point));
    state.stacks.enemyDamageDownPct = 14;
    state.stacks.enemyDamageDownTurns = 3;
    state.stacks.nextAttackDamageDownPct = 30;
    expect(cast(state).state.stacks).toMatchObject({
      enemyDamageDownPct:14, enemyDamageDownTurns:3, nextAttackDamageDownPct:30,
    });
  });

  it.each(["p1", "p2"] as const)("PvP %s의 공격 스킬도 선언 누적과 횟수를 보존한다", who => {
    vi.spyOn(Math, "random").mockReturnValue(.1);
    const state = initialBattleStatePvP(player, player, "A", "B", skills(point, mastery), skills(point, mastery));
    state[who].duelistBuff = {
      ...composeDuelistDeclaration([form, "v2c_undefeated_momentum"], form)!,
      landedBasicHits:3,
    };
    const result = castV2SkillOnAttackerTurnPvP(state, who);
    expect(result.state[who].duelistBuff).toMatchObject({remainingBasicHits:6, landedBasicHits:3});
  });

  it("PvP에서 공격이 보장 회피되면 공격자에게 걸린 약화도 보존된다", () => {
    vi.spyOn(Math, "random").mockReturnValue(.1);
    const state = initialBattleStatePvP(player, player, "A", "B", skills(point));
    state.p1.stacks.nextAttackDamageDownPct = 30;
    state.p2.stacks.evadesRemaining = 1;
    const after = castV2SkillOnAttackerTurnPvP(state, "p1").state;
    expect(after.p1.stacks.nextAttackDamageDownPct).toBe(30);
    expect(after.p2.hp).toBe(state.p2.hp);
  });
});
