import type { V2SkillDefinition } from "./v2Skills";

export type LightningMageSkillId =
  | "v2c_electromancer_chain"
  | "v2c_electromancer_capacitor"
  | "v2c_electromancer_conduction"
  | "v2c_thundersovereign_descent"
  | "v2c_thundersovereign_heart"
  | "v2c_thundersovereign_thunderclap";

/** 전격 계보 5·6차 — 취약이 걸린 대상에게 치명타와 관통으로 보상한다. 별도 전투 자원은 없다. */
export const LIGHTNING_MAGE_SKILLS: Record<LightningMageSkillId, V2SkillDefinition> = {
  v2c_electromancer_chain: {
    lightningMageSpell: true,
    id: "v2c_electromancer_chain", name: "연쇄 뇌격", stat: "int", category: "attack", tier: 3,
    description: "번개를 두 갈래로 잇달아 떨어뜨린다. 방어가 노출된 적일수록 치명적인 곳을 찌른다.",
    detail: {
      mechanics: ["단일 마법 피해를 두 번 준다. 대상이 취약 상태면 이 스킬의 치명타 확률이 25%p 오른다."],
      synergies: ["천뢰격·만뢰 강림으로 취약을 먼저 걸면 조건을 채운다. 룬 검격처럼 다른 스킬로 건 취약도 인정한다."],
      limitations: ["이번 행동을 시작할 때 이미 걸려 있던 취약만 인정한다. 치명타 확률 상한과 대전의 치명타 저항을 그대로 따른다."],
    },
    mpCost: 52, cooldown: 0, procChance: 30, learnCost: 8000,
    vulnerableTargetCritChancePct: 25,
    effects: [
      { kind: "damage", scaling: "magic", statCoef: 1.35, attackCoef: 1.35, primaryStatCoef: 1 },
      { kind: "damage", scaling: "magic", statCoef: 1.35, attackCoef: 1.35, primaryStatCoef: 1 },
    ],
  },
  v2c_electromancer_capacitor: {
    id: "v2c_electromancer_capacitor", name: "축전", stat: "int", category: "passive", tier: 3,
    description: "쌓아 둔 전류를 치명적인 순간에 한꺼번에 흘려보낸다.",
    detail: { mechanics: ["모든 직업에서 스킬 치명타 피해 20% 증가."], limitations: ["기본 공격의 치명타 피해는 올리지 않는다."] },
    mpCost: 0, cooldown: 0, learnCost: 8000, effects: [],
    passive: { skillCritDmgPct: 20 },
  },
  v2c_electromancer_conduction: {
    id: "v2c_electromancer_conduction", name: "전도", stat: "int", category: "passive", tier: 3,
    description: "한 번 노출된 방어에 전류를 흘려 빈틈이 닫히지 않게 한다.",
    detail: {
      mechanics: ["자신이 새로 거는 취약의 지속이 1행동 늘어난다.", "천뢰격·연쇄 뇌격·만뢰 강림 MP 소모 20% 감소."],
      limitations: ["이미 걸린 취약에 반복해서 더하지 않는다. 마법취약 중첩과 지속 피해 취약의 지속에는 영향을 주지 않는다."],
    },
    mpCost: 0, cooldown: 0, learnCost: 8000, effects: [],
    passive: { vulnDurationBonusTurns: 1, lightningSpellMpCostReductionPct: 20 },
  },
  v2c_thundersovereign_descent: {
    lightningMageSpell: true,
    id: "v2c_thundersovereign_descent", name: "만뢰 강림", stat: "int", category: "attack", tier: 3,
    description: "하늘을 가득 메운 벼락을 한 점에 내리꽂아 노출된 방어 너머까지 꿰뚫는다.",
    detail: {
      mechanics: ["강력한 단일 마법 피해를 주고 대상에게 취약 18%를 3행동 동안 건다. 대상이 이미 취약 상태면 방어 적용 전 피해의 20%를 방어 무시 추가 피해로 더한다."],
      limitations: ["관통은 추가 피해이며 대상의 방어력을 낮추지 않는다. 이 시전이 새로 거는 취약은 관통 조건에 포함하지 않는다."],
    },
    mpCost: 64, cooldown: 0, procChance: 30, learnCost: 12000,
    vulnerableTargetPiercePct: 20,
    effects: [
      { kind: "damage", scaling: "magic", statCoef: 3.9, attackCoef: 3.9, primaryStatCoef: 3.2 },
      { kind: "enemyVuln", pct: 18, turns: 3 },
    ],
  },
  v2c_thundersovereign_heart: {
    id: "v2c_thundersovereign_heart", name: "뇌신의 심장", stat: "int", category: "passive", tier: 3,
    description: "벼락이 급소에 꽂히는 순간 그 반동을 타고 다음 주문을 앞당긴다.",
    detail: {
      mechanics: ["천뢰격·연쇄 뇌격·만뢰 강림이 치명타로 적중하면 다음 행동이 20% 빨라진다."],
      limitations: ["빗나가거나 치명타가 아니면 발생하지 않는다. 다른 가속과 겹치면 큰 값 하나만 적용한다."],
    },
    mpCost: 0, cooldown: 0, learnCost: 12000, effects: [],
    passive: { lightningCritHastePct: 20 },
  },
  v2c_thundersovereign_thunderclap: {
    id: "v2c_thundersovereign_thunderclap", name: "뇌정", stat: "int", category: "passive", tier: 3,
    description: "천둥이 뒤따르듯 급소를 찌른 주문의 충격을 한층 키운다.",
    detail: { mechanics: ["모든 직업에서 스킬 치명타 피해 30% 증가."], synergies: ["축전과 함께 장착하면 합산해 50%."] },
    mpCost: 0, cooldown: 0, learnCost: 12000, effects: [],
    passive: { skillCritDmgPct: 30 },
  },
};
