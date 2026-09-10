// NEXT_PUBLIC_V2_CORE_LOOP_V2=true NEXT_PUBLIC_V2_SKILL_PROC_IN_PATTERN=true NODE_PATH=./scripts/server-only-stub node --import tsx scripts/sim-dark-priest-advancement.ts
// 고정 시드, Lv100/무장비/동일 스탯 총량/50 SP. 최적 빌드 탐색이 아닌 초기 밸런스 점검.
import assert from "node:assert/strict";
import { derivePlayerCombatV2Pure } from "../src/lib/server/derivePlayerCombatV2";
import { V2_SKILLS, aggregateEquippedPassives, smartDefaultPatternFromEquipped, spCostOf, v2SkillMpCostValue, type V2SkillId, type V2SkillsState } from "../src/adventure/data/v2/v2Skills";
import { V2_SKILLS_BY_JOB } from "../src/adventure/data/v2/v2SkillsByJob";
import { resolveBattleAtb } from "../src/adventure/v2/combat/engine.atb";
import { resolveBattlePvPAtb } from "../src/adventure/v2/combat/engine.pvp-atb";
import type { Monster } from "../src/adventure/data/monsters";
import type { V2Class } from "../src/adventure/data/v2/classes";
const trials = 50;
const core: V2SkillId = "v2c_darkpriest_blessing";
const dark: Record<number, V2SkillId[]> = {
  3: [core, "v2c_darkpriest_reap"],
  4: [core, "v2c_confessor_absolution", "v2c_confessor_condemnation"],
  5: [core, "v2c_confessor_absolution", "v2c_atonementbishop_sentence", "v2c_atonementbishop_cycle"],
  6: [core, "v2c_confessor_absolution", "v2c_atonementbishop_sentence", "v2c_atonementbishop_cycle", "v2c_darksaint_sanctuary", "v2c_darksaint_officiant"],
};
const opponents = [
  ["templar", "crusader", "radiantknight", "dawnpaladin"],
  ["bloodtemplar", "crimsontemplar", "bloodlord", "blooddemon"],
  ["shaman", "archshaman", "calamitycaller", "doomprophet"],
  ["shadow", "phantom", "nightshade", "shadowblade"],
];
function fillBudget(kit: V2SkillId[]): V2SkillId[] {
  const needed = 50 - kit.reduce((sum, id) => sum + spCostOf(V2_SKILLS[id]), 0);
  assert(needed >= 0, `${kit.join(",")} exceeds budget by ${-needed}`);
  const pool = Object.values(V2_SKILLS).filter(s => s.category === "passive" && s.tier <= 2 && !kit.includes(s.id));
  const ways = new Map<number, V2SkillId[]>([[0, []]]);
  for (const skill of pool) for (const [cost, ids] of [...ways]) {
    const next = cost + spCostOf(skill);
    if (next <= needed && !ways.has(next)) ways.set(next, [...ids, skill.id]);
  }
  assert(ways.has(needed), `50 SP 충전 실패: ${needed}`);
  return [...kit, ...ways.get(needed)!];
}
function build(kit: V2SkillId[], tier: number, cls: V2Class) {
  const ids = fillBudget(kit);
  const p = aggregateEquippedPassives(ids);
  const derived = Object.fromEntries(Object.entries(p).map(([k,v]) => [`passive${k[0].toUpperCase()}${k.slice(1)}`,v]));
  const allocatedStats = cls === "mage" ? { str:0,vit:300,dex:100,luk:0,int:600,spi:350 } : cls === "rogue" ? { str:0,vit:300,dex:100,luk:600,int:0,spi:350 } : { str:600,vit:300,dex:100,luk:0,int:0,spi:350 };
  const player = derivePlayerCombatV2Pure({ ...derived, level:100, lifeResourceGrowth:{version:2,rolledLevel:100,baseHp:1000,baseMp:300,gainedHp:7000,gainedMp:1200}, allocatedStats, v2Equipped:{}, playerClass:cls, classTier:tier, statPct:p.statPct, maxHpPct:p.maxHpPct, maxMpPct:p.maxMpPct, atkPerDexCoef:p.atkPerDexCoef, atkPerLukCoef:p.atkPerLukCoef }).player;
  const skills: V2SkillsState = { learned:ids, equipped:ids, pattern:smartDefaultPatternFromEquipped(ids) };
  return { player, skills, sp:50 };
}
const builds = Object.fromEntries([3,4,5,6].flatMap(tier => [
  [`dark${tier}`, build(dark[tier], tier, "rogue")],
  ...opponents.map((line,index) => [line[tier-3], build([...V2_SKILLS_BY_JOB[line[tier-3]], ...(index===0 && tier>3 ? ["v2c_templar_smite" as V2SkillId] : [])], tier, index===2?"mage":index===3?"rogue":"warrior")]),
])) as Record<string, ReturnType<typeof build>>;
for (const mode of ["never","always"] as const) {
  const b = build(dark[6],6,"rogue");
  const rest = b.skills.pattern!.blocks.filter(block => block.action.kind!=="skill" || block.action.skillId!=="v2c_darksaint_sanctuary");
  b.skills.pattern = { blocks: mode === "never" ? rest : [{condition:{kind:"always"},action:{kind:"skill",skillId:"v2c_darksaint_sanctuary"}},...rest] };
  builds[`dark6_${mode}`]=b;
}
let randomState=1;
const original=Math.random;
Math.random=()=>{randomState=(Math.imul(1664525,randomState)+1013904223)>>>0;return randomState/4294967296;};
const ref=builds.dark6.player;
const ordinary:Monster={name:"비교 적",tags:[],hp:14000,atk:900,def:100,magicDef:100,spd:ref.spd,exp:0};
const scenarios:Record<string,Monster>={ordinary, heavy:{...ordinary,atk:2600,spd:ref.spd*.65}, fast:{...ordinary,atk:900,spd:ref.spd*2.5}, multihit:{...ordinary,atk:900,bonusAttackChancePct:200}, burst:{...ordinary,atk:4000,bonusAttackChancePct:200,spd:ref.spd*.8}, lethalBurst:{...ordinary,atk:6000,bonusAttackChancePct:200,spd:ref.spd*.8}, endurance:{...ordinary,hp:1000000,atk:400}};
const pve:unknown[]=[];const pvp:unknown[]=[];
const round=(n:number)=>Math.round(n*100)/100;
try {
  for(const [scenario,enemy] of Object.entries(scenarios)) for(const [name,b] of Object.entries(builds)) {
    let wins=0,actions=0,mp=0,generated=0,consumed=0,repaid=0,healed=0,sanctuary=0,starved=0;
    const minMp=Math.min(...b.skills.equipped.filter(id=>V2_SKILLS[id].category!=="passive").map(id=>v2SkillMpCostValue(V2_SKILLS[id])));
    for(let trial=1;trial<=trials;trial++) {
      randomState=trial;
      const r=resolveBattleAtb(b.player,enemy,name,{potions:{},pickAction:()=>({kind:"attack"}),forceAtbSkills:true,maxTurns:60,v2Skills:b.skills});
      const log=r.finalState.log;
      wins+=Number(r.outcome==="win");
      actions+=new Set(log.filter(e=>e.turn==="player"&&e.t!=null).map(e=>e.t)).size;
      mp+=r.finalState.playerMp;
      starved+=Number(log.some(e=>e.kind==="hp_bar"&&e.playerMp!=null&&e.playerMp<minMp));
      for(const e of log) {
        if("painEvent" in e && e.painEvent) {
          const p=e.painEvent;
          if(p.kind==="defer")generated+=p.amount;
          if(p.kind==="consume")consumed+=p.amount;
          if(p.kind==="repay")repaid+=p.amount;
          if(p.kind==="sanctuary")sanctuary++;
        }
        if(e.turn==="player")healed+=Number(e.text.match(/HP ([\d,]+) 회복했다/)?.[1].replaceAll(",","")??0);
      }
      assert((r.finalState.stacks.pain?.debt??0)<=Math.floor(r.finalState.playerMaxHp*.2));
    }
    pve.push({scenario,name,winPct:wins*2,actions:round(actions/trials),remainingMp:round(mp/trials),mpStarvedPct:starved*2,painGenerated:round(generated/trials),painConsumed:round(consumed/trials),painRepaid:round(repaid/trials),healed:round(healed/trials),sanctuaryUses:round(sanctuary/trials)});
  }
  for(const tier of [3,4,5,6]) for(const line of opponents) {
    const opponent=line[tier-3];let wins=0,draws=0;
    for(let trial=1;trial<=trials;trial++) {
      randomState=trial+1000;const swap=trial%2===0;
      const a=builds[swap?opponent:`dark${tier}`],b=builds[swap?`dark${tier}`:opponent];
      const r=resolveBattlePvPAtb(a.player,b.player,"A","B",{potions:{p1:{},p2:{}},pickAction:()=>({kind:"attack"}),v2Skills:{p1:a.skills,p2:b.skills}});
      wins+=Number(r.outcome===(swap?"p2_win":"p1_win"));draws+=Number(r.outcome==="draw");
    }
    pvp.push({tier,opponent,winPct:wins*2,drawPct:draws*2});
  }
} finally { Math.random=original; }
console.log(JSON.stringify({trials,budget:50,builds:Object.fromEntries(Object.entries(builds).map(([name,b])=>[name,{sp:b.sp,skills:b.skills.equipped,hp:b.player.maxHp,mp:b.player.maxMp}])),costs:Object.fromEntries([...new Set(Object.values(dark).flat())].map(id=>[id,{sp:spCostOf(V2_SKILLS[id]),mp:v2SkillMpCostValue(V2_SKILLS[id])}])),pve,pvp},null,2));
