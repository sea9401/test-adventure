import type { V2SkillDefinition } from "./v2Skills";
export type DarkPriestSkillId = "v2c_confessor_absolution" | "v2c_confessor_condemnation" | "v2c_atonementbishop_sentence" | "v2c_atonementbishop_cycle" | "v2c_darksaint_sanctuary" | "v2c_darksaint_officiant";
export const DARK_PRIEST_SKILLS: Record<DarkPriestSkillId, V2SkillDefinition> = {
  v2c_confessor_absolution: {
    id: "v2c_confessor_absolution", name: "사죄의 기도", stat: "luk", category: "heal", tier: 3,
    description: "고통을 거두고 스스로를 용서한다.",
    detail: { mechanics: ["고통을 최대 HP 8%만큼 소비한다. 최대 HP 2% + 소비한 고통 25%를 회복한다(회복량 보정 적용)."], limitations: ["고통 해소 자체는 회복이 아니므로 회복 강화·감소·회복 보호막 효과를 받지 않는다."] },
    mpCost: 46, fixedMpCost: 100, cooldown: 0, procChance: 35, learnCost: 6000, spCost: 6,
    painRitual: "absolve", effects: [],
  },
  v2c_confessor_condemnation: {
    id: "v2c_confessor_condemnation", name: "단죄의 낙인", stat: "luk", category: "attack", tier: 3,
    description: "짊어진 고통으로 적에게 단죄를 내린다.",
    detail: { mechanics: ["고통을 최대 HP 8%만큼 소비하고 소비 비율에 따라 단일 물리 공격 위력이 최대 40% 증가한다."], limitations: ["회복과 흡혈이 없으며 빗나가도 고통은 소비한다."] },
    mpCost: 46, fixedMpCost: 100, cooldown: 0, procChance: 35, learnCost: 6000, spCost: 6,
    painRitual: "condemn", effects: [{ kind: "damage", statCoef: 1.8, attackCoef: 1.8, scaling: "luk" }],
  },
  v2c_atonementbishop_sentence: {
    id: "v2c_atonementbishop_sentence", name: "속죄의 선고", stat: "luk", category: "attack", tier: 3,
    description: "고통을 끊어 강한 선고를 내린다.",
    detail: { mechanics: ["고통을 최대 HP 10%만큼 소비하며 단일 물리 공격 위력이 소비 비율에 따라 최대 40% 증가한다."], limitations: ["회복과 흡혈이 없으며 빗나가도 고통은 소비한다."] },
    mpCost: 52, fixedMpCost: 130, cooldown: 0, procChance: 35, learnCost: 8000, spCost: 8,
    painRitual: "sentence", effects: [{ kind: "damage", statCoef: 2.5, attackCoef: 2.5, scaling: "luk" }],
  },
  v2c_atonementbishop_cycle: {
    id: "v2c_atonementbishop_cycle", name: "속죄의 순환", stat: "luk", category: "passive", tier: 3,
    description: "사죄와 단죄가 다음 의식을 이끈다.",
    detail: { mechanics: ["고통을 소비한 사죄 후 다음 단죄 위력 +15%, 단죄 후 다음 사죄 회복량 +20%. 표식은 한 개이며 반대 의식에서 한 번 소비한다."], limitations: ["검은 축복을 함께 장착해야 한다. 고통 0에서는 새 표식을 만들지 않는다."] },
    mpCost: 0, cooldown: 0, learnCost: 8000, spCost: 4, effects: [], passive: {},
  },
  v2c_darksaint_sanctuary: {
    id: "v2c_darksaint_sanctuary", name: "검은 성역", stat: "luk", category: "buff", tier: 3,
    description: "검은 기도로 상환을 미루고 남은 고통을 정리할 시간을 번다.",
    detail: { mechanics: ["전투당 1회. 시전 포함 자기 행동 4회 동안 고통 상환을 유예하고 마지막 행동 종료에 잔여 고통을 모두 상환한다."], limitations: ["검은 축복 장착 및 고통 최대 HP 5% 이상 필요. 시전 자체에는 피해·회복이 없다. 기절로 행동을 놓쳐도 지속시간은 감소한다."] },
    mpCost: 58, fixedMpCost: 150, cooldown: 0, procChance: 100, learnCost: 10000, spCost: 5,
    painRitual: "sanctuary", effects: [],
  },
  v2c_darksaint_officiant: {
    id: "v2c_darksaint_officiant", name: "고통의 집전자", stat: "luk", category: "passive", tier: 3,
    description: "검은 성역에서 더 많은 고통을 거둔다.",
    detail: { mechanics: ["검은 성역 중 사죄·단죄의 고통 소비 한도 +25%. 단죄 위력 강화 상한은 40%로 유지한다."], limitations: ["검은 축복을 함께 장착해야 한다. 평소 소비 한도와 고통 저장 상한은 늘리지 않는다."] },
    mpCost: 0, cooldown: 0, learnCost: 10000, spCost: 3, effects: [], passive: {},
  },
};
