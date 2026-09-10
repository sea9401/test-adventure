// NODE_PATH=./scripts/server-only-stub node --import tsx scripts/sim-monk-counter.ts
// 반격 단독 효과 비교. 매 표본을 같은 초기 상태에서 시작하고 기존/개선에 같은 시드를 쓴다.
import assert from "node:assert/strict";
import { initialBattleState, type PlayerCombat } from "../src/adventure/v2/combat/engine";
import { resolveEnemyPhase } from "../src/adventure/v2/combat/engine.enemyPhase";
import { initialBattleStatePvP, castV2SkillOnAttackerTurnPvP } from "../src/adventure/v2/combat/engine-pvp";
const original = Math.random;
let seed = 1;
Math.random = () => { seed = (Math.imul(seed,1664525)+1013904223)>>>0; return seed/4294967296; };
const player:PlayerCombat={hp:1000000,maxHp:1000000,mp:10000,maxMp:10000,atk:200,def:0,vitStat:300,spd:50,attackCount:1,accuracyPct:100,evasionPct:0,passiveCounterChancePct:30};
const rows:unknown[]=[];
try {
 for (const vit of [100,300,600]) for (const shield of [0,10000]) for (const improved of [false,true]) {
  let count=0,damage=0;
  for(let i=1;i<=1000;i++) {
   seed=i;
   const defender={...player,vitStat:vit,bulwarkShield:shield,...(improved?{passiveCounterVitCoef:1}:{})};
   let s=initialBattleState(defender,{name:"3연타",tags:[],hp:1000000,atk:100,def:0,spd:60,exp:0},"투승");
   for(let hit=0;hit<3;hit++)s=resolveEnemyPhase({...s,phase:"enemy"},defender,"투승",true);
   const counters=s.log.filter(e=>e.text.includes("[반격]"));
   count+=counters.length;damage+=1000000-s.enemyHp;
   assert(counters.length<=3);
  }
  rows.push({mode:"PvE 3 basic hits",vit,shield,improved,counterCount:count,damage,damagePerCounter:count?damage/count:0});
 }
 for(const improved of [false,true]) {
  let count=0,damage=0;
  for(let i=1;i<=1000;i++) {
   seed=i;
   const defender={...player,bulwarkShield:10000,...(improved?{passiveCounterVitCoef:1}:{})};
   const skills={learned:["v2c_warrior_flurry" as const],equipped:["v2c_warrior_flurry" as const]};
   const s=initialBattleStatePvP(player,defender,"A","B",skills);
   const r=castV2SkillOnAttackerTurnPvP(s,"p1").state;
   const counters=r.log.filter(e=>e.text.includes("[반격]"));
   assert(counters.length<=1,"다단 스킬 시전당 반격은 최대 1회");
   count+=counters.length;damage+=s.p1.hp-r.p1.hp;
  }
  rows.push({mode:"PvP flurry cast",vit:300,shield:10000,improved,counterCount:count,damage,damagePerCounter:count?damage/count:0});
 }
} finally { Math.random=original; }
console.log(JSON.stringify({samplesPerRow:1000,atk:200,counterChancePct:30,rows},null,2));
