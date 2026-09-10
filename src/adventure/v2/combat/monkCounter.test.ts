import { afterEach, expect, it, vi } from "vitest";
import { aggregateEquippedPassives, type V2SkillId } from "@/adventure/data/v2/v2Skills";
import { derivePlayerCombatV2Pure } from "@/lib/server/derivePlayerCombatV2";
import { initialBattleState, applyEnemyV2SkillCast, applyPassiveCounterOnHitIfAny, type PlayerCombat } from "./engine";
import { initialBattleStatePvP, castV2SkillOnAttackerTurnPvP } from "./engine-pvp";
import { resolveEnemyPhase } from "./engine.enemyPhase";
import { advanceTurnPvP } from "./engine.pvpPhase";
const base: PlayerCombat = { hp:10000,maxHp:10000,mp:10000,maxMp:10000,atk:100,def:0,spd:50,vitStat:300,evasionPct:0,accuracyPct:100,attackCount:1 };
const enemy = { name:"시험체",tags:[],hp:10000,atk:100,def:0,spd:60,exp:0 };
const monk = { ...base, passiveCounterChancePct:100, passiveCounterVitCoef:1, bulwarkShield:10000 };
afterEach(()=>vi.restoreAllMocks());
it.each(["v2c_battlemonk_counter","v2c_adamantmonk_body","v2c_vajraarhat_body"] as V2SkillId[])("%s를 단독 장착하면 활력 반격을 얻는다",id=>{
 const p=aggregateEquippedPassives([id]);
 expect(p.counterVitCoef).toBe(1);
 expect(derivePlayerCombatV2Pure({level:100,passiveCounterVitCoef:p.counterVitCoef}).player.passiveCounterVitCoef).toBe(1);
});
it("같은 계열 반격을 모아도 활력 계수는 중첩하지 않는다",()=>{
 expect(aggregateEquippedPassives(["v2c_battlemonk_counter","v2c_adamantmonk_body","v2c_vajraarhat_body"]).counterVitCoef).toBe(1);
});
it("공격력이 같아도 활력이 오르면 반격 피해가 오른다",()=>{
 vi.spyOn(Math,"random").mockReturnValue(.5);
 const s=initialBattleState(monk,enemy,"투승");
 const low=applyPassiveCounterOnHitIfAny(s,{...monk,vitStat:100});
 const high=applyPassiveCounterOnHitIfAny(s,{...monk,vitStat:300});
 expect(low.enemyHp-high.enemyHp).toBe(200);
});
it("PvE 보호막 기본 피격도 반격한다",()=>{
 vi.spyOn(Math,"random").mockReturnValue(.5);
 const s=initialBattleState(monk,enemy,"투승");
 const r=resolveEnemyPhase(s,monk,"투승",true);
 expect(r.playerHp).toBe(monk.hp);
 expect(r.stacks.playerShield).toBeLessThan(s.stacks.playerShield);
 expect(r.enemyHp).toBeLessThan(s.enemyHp);
});
it("PvE 보호막 스킬 피격도 반격한다",()=>{
 vi.spyOn(Math,"random").mockReturnValue(.1);
 const foe={...enemy,v2Skills:{learned:["mob_crushing_blow" as const],equipped:["mob_crushing_blow" as const]},v2MaxMp:100};
 const s=initialBattleState(monk,foe,"투승");
 const r=applyEnemyV2SkillCast(s,monk).state;
 expect(r.playerHp).toBe(monk.hp);
 expect(r.stacks.playerShield).toBeLessThan(s.stacks.playerShield);
 expect(r.enemyHp).toBeLessThan(s.enemyHp);
});
it.each(["p1","p2"] as const)("PvP %s 보호막 기본/다단 스킬 피격에도 한 번씩 반격한다",who=>{
 vi.spyOn(Math,"random").mockReturnValue(.1);
 const other=who==="p1"?"p2":"p1";
 const skills={learned:["v2c_warrior_flurry" as const],equipped:["v2c_warrior_flurry" as const]};
 const s=initialBattleStatePvP(monk,monk,"A","B",skills,skills);
 s.phase=who;
 const basic=advanceTurnPvP(s,{kind:"attack"},{tickDefenderDots:false});
 const skill=castV2SkillOnAttackerTurnPvP(s,who).state;
 for(const r of [basic,skill]) {
   expect(r[other].hp).toBe(s[other].hp);
   expect(r[other].stacks.playerShield).toBeLessThan(s[other].stacks.playerShield);
   expect(r[who].hp).toBeLessThan(s[who].hp);
   expect(r.log.filter(e=>e.text.includes("[반격]")).length).toBe(1);
 }
});
it("활력 버프만 활력 반격분에 적용하고 방어력 수치는 공격으로 전환하지 않는다",()=>{
 vi.spyOn(Math,"random").mockReturnValue(.5);
 const s=initialBattleState(monk,enemy,"투승");
 const raw=applyPassiveCounterOnHitIfAny(s,monk);
 const buffed=applyPassiveCounterOnHitIfAny({...s,v2SelfBuffs:{vit:{pct:50,turns:2}}},monk);
 expect(raw.enemyHp-buffed.enemyHp).toBe(150);
 expect(applyPassiveCounterOnHitIfAny(s,{...monk,def:99999}).enemyHp).toBe(raw.enemyHp);
});
it("확정 회피한 공격에는 무승 반격도 발동하지 않는다",()=>{
 vi.spyOn(Math,"random").mockReturnValue(.1);
 const s=initialBattleStatePvP(monk,{...monk,guaranteedEvades:1},"A","B");
 s.phase="p1";
 const r=advanceTurnPvP(s,{kind:"attack"},{tickDefenderDots:false});
 expect(r.p1.hp).toBe(s.p1.hp);
 expect(r.log.some(e=>e.text.includes("[반격]"))).toBe(false);
});
