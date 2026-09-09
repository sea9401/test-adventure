import type { V2SkillDefinition } from "./v2Skills";
import { V2_DOT_PRESETS } from "./statusEffects";

const FIRE_BURST_SHIELD_PCT_MAX_MP = 20;

export type FireMageSkillId =
  | "v2c_pyromancer_brand"
  | "v2c_pyromancer_spirit"
  | "v2c_pyromancer_burn"
  | "v2c_infernomancer_collapse"
  | "v2c_infernomancer_heart"
  | "v2c_infernomancer_burn";

export const FIRE_MAGE_SKILLS: Record<FireMageSkillId, V2SkillDefinition> = {
  v2c_pyromancer_brand: {
    fireMageSpell: true,
    id: "v2c_pyromancer_brand", name: "홍염의 낙인", stat: "int", category: "attack", tier: 3,
    description: "꺼지지 않는 홍염을 새겨 적을 태우고 지속되는 고통을 증폭한다.",
    detail: {
      mechanics: ["단일 마법 피해와 연소 1중첩을 부여한다. 연소 유지 중 회복 스킬·재생이 50% 감소하며 대상의 지속 피해 취약을 25% 높인다. 취약은 대상 행동 3회 동안 유지된다."],
      synergies: ["연소 외에 출혈·중독의 지속 피해와 마법취약 스택 폭발도 강화한다."],
      limitations: ["취약은 중첩되지 않고 재시전 시 지속시간을 갱신한다. 일반 직접 공격 피해는 강화하지 않는다."],
    },
    mpCost: 52, cooldown: 0, procChance: 30, learnCost: 8000,
    effects: [
      { kind: "damage", scaling: "magic", statCoef: 2.45, attackCoef: 2.45, primaryStatCoef: 1.8 },
      { kind: "dot", ...V2_DOT_PRESETS.연소 },
      { kind: "enemyDotVuln", pct: 25, turns: 3 },
    ],
  },
  v2c_pyromancer_spirit: {
    id: "v2c_pyromancer_spirit", name: "불꽃의 정신", stat: "int", category: "passive", tier: 3,
    description: "남은 불씨를 붙잡아 연소를 오래 유지한다.",
    detail: { mechanics: ["자신이 새로 부여하는 연소 지속시간이 대상 행동 1회만큼 증가한다.", "홍련술·홍염의 낙인·겁화 붕괴 MP 소모 20% 감소."], limitations: ["기존 연소에 반복 가산하지 않는다. 출혈·중독의 지속시간에는 영향을 주지 않는다."] },
    mpCost: 0, cooldown: 0, learnCost: 8000, effects: [],
    passive: { burnDurationBonusTurns: 1, fireSpellMpCostReductionPct: 20 },
  },
  v2c_pyromancer_burn: {
    id: "v2c_pyromancer_burn", name: "작열", stat: "int", category: "passive", tier: 3,
    description: "남겨진 불길이 적을 더욱 깊이 태운다.",
    detail: { mechanics: ["모든 직업에서 자신이 부여하는 연소 피해 30% 증가."] },
    mpCost: 0, cooldown: 0, learnCost: 8000, effects: [],
    passive: { burnDamagePct: 30 },
  },
  v2c_infernomancer_collapse: {
    fireMageSpell: true,
    id: "v2c_infernomancer_collapse", name: "겁화 붕괴", stat: "int", category: "attack", tier: 3,
    description: "압축한 겁화를 한순간에 터뜨려 적의 방어 너머까지 불태운다.",
    detail: {
      mechanics: ["강력한 단일 마법 피해에 방어 적용 전 피해의 20%를 방어 무시 추가 피해로 더한다."],
      limitations: ["대상의 방어력을 낮추지는 않는다. 연소 중첩을 요구하거나 소비하지 않으며 지속 피해 취약의 증폭 대상이 아니다."],
    },
    mpCost: 64, cooldown: 0, procChance: 30, learnCost: 12000,
    effects: [{ kind: "damage", scaling: "magic", statCoef: 3.65, attackCoef: 3.65, primaryStatCoef: 3, pierceDamagePct: 20 }],
    equippedSynergies: [{ requiredSkillId: "v2c_infernomancer_heart", effects: [{ kind: "dot", ...V2_DOT_PRESETS.연소 }, { kind: "shield", pctMaxMp: FIRE_BURST_SHIELD_PCT_MAX_MP, turns: 1 }] }],
  },
  v2c_infernomancer_heart: {
    id: "v2c_infernomancer_heart", name: "겁화의 심장", stat: "int", category: "passive", tier: 3,
    description: "겁화가 터진 자리에 불씨를 남겨 다시 타오르게 한다.",
    detail: { mechanics: ["겁화 붕괴가 적중하면 연소 1중첩을 부여한다.", "겁화 붕괴 사용 시 최대 MP의 20% 보호막 획득. 보호막은 대상 회피와 무관하게 생성되며 소진될 때까지 유지된다."], synergies: ["불꽃의 정신과 연소 피해 패시브가 적용된다. 이미 연소 중이면 기존 규칙에 따라 갱신한다."] },
    mpCost: 0, cooldown: 0, learnCost: 12000, effects: [],
    passive: { burnRekindle: true, fireBurstShieldPctMaxMp: FIRE_BURST_SHIELD_PCT_MAX_MP },
  },
  v2c_infernomancer_burn: {
    id: "v2c_infernomancer_burn", name: "영겁의 불꽃", stat: "int", category: "passive", tier: 3,
    description: "꺼지지 않는 겁화로 적에게 깊은 화상을 남긴다.",
    detail: { mechanics: ["모든 직업에서 자신이 부여하는 연소 피해 50% 증가."] },
    mpCost: 0, cooldown: 0, learnCost: 12000, effects: [],
    passive: { burnDamagePct: 50 },
  },
};
