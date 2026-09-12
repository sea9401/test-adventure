import type { V2SkillDefinition } from "./v2Skills";
import { V2_DOT_PRESETS } from "./statusEffects";

export type Tier7ExpansionSkillId =
  | "v2c_aegis_strike" | "v2c_aegis_barrier" | "v2c_aegis_guardian"
  | "v2c_seraphim_judgment" | "v2c_seraphim_wings" | "v2c_seraphim_grace"
  | "v2c_dragonlord_claw" | "v2c_dragonlord_breath" | "v2c_dragonlord_heart";

/** 기존 공통 효과로 구성하여 사냥·PvP·계승에 같은 규칙을 적용한다.
 * stat은 구 6스탯 분류이므로 정신 계열도 int로 분류한다. 실제 피해·회복은 scaling: spi다.
 */
export const TIER7_EXPANSION_SKILLS: Record<Tier7ExpansionSkillId, V2SkillDefinition> = {
  v2c_aegis_strike: {
    id: "v2c_aegis_strike", name: "수호자의 강타", stat: "vit", category: "attack", tier: 3,
    description: "방패로 적을 밀쳐낸 뒤 수호의 빛으로 관통한다. 방어력과 정신을 공격에 활용한다.",
    detail: {
      mechanics: ["방어력 기반 물리 피해와 정신 기반 마법 피해를 각각 한 번 가한다."],
      synergies: ["불굴의 수호자가 높인 방어력과 정신을 두 타격에 활용한다."],
      limitations: ["각 타격은 각각 물리·마법 방어의 영향을 받는다. 보호막을 소비하거나 받은 피해를 반사하지 않는다."],
    },
    mpCost: 70, cooldown: 0, procChance: 50, learnCost: 20000, spCost: 16,
    effects: [
      { kind: "damage", scaling: "def", statCoef: 2.8, attackCoef: 1.2 },
      { kind: "damage", scaling: "spi", statCoef: 2.8, attackCoef: 1.2, pierceDamagePct: 15 },
    ],
  },
  v2c_aegis_barrier: {
    id: "v2c_aegis_barrier", name: "절대 방벽", stat: "vit", category: "buff", tier: 3,
    description: "거대한 방벽을 세워 피해를 흡수하고 잠시 받는 피해를 줄인다.",
    detail: {
      mechanics: ["최대 HP의 30% 보호막과 받는 피해 18% 감소를 3턴 동안 얻는다."],
      limitations: ["무적 효과가 아니며 기본 패턴은 보호막이 없을 때만 시전한다."],
    },
    mpCost: 90, cooldown: 0, procChance: 100, learnCost: 20000, spCost: 10,
    defaultPattern: { priority: 600, condition: { kind: "self_shield", active: false } },
    effects: [{ kind: "shield", pctMaxHp: 30, turns: 3 }, { kind: "selfBuffPct", target: "damageReduction", pct: 18, turns: 3 }],
  },
  v2c_aegis_guardian: {
    id: "v2c_aegis_guardian", name: "불굴의 수호자", stat: "vit", category: "passive", tier: 3,
    description: "육체와 정신을 함께 단련해 물리와 마법 모두에 맞선다.",
    detail: { mechanics: ["활력과 정신 각각 30%, 물리·마법 방어력 36%, 최대 HP 20% 증가."], synergies: ["직업을 바꿔도 장착 중에는 적용된다."] },
    mpCost: 0, cooldown: 0, learnCost: 20000, spCost: 20, effects: [],
    passive: { statPct: { vit: 30, spi: 30 }, defPct: 36, maxHpPct: 20 },
  },
  v2c_seraphim_judgment: {
    id: "v2c_seraphim_judgment", name: "천상의 심판", stat: "int", category: "attack", tier: 3,
    description: "천상의 빛으로 적을 심판하고 자신에게 치유의 은총을 내린다.",
    detail: {
      mechanics: ["정신 기반 마법 피해를 가하고 정신에 비례해 자신의 HP를 회복한다."],
      synergies: ["찬란한 은총은 정신과 직접 마법 피해, 회복량을 함께 높인다."],
      limitations: ["회복은 자신의 최대 HP를 넘지 않으며 적에게 준 피해량과 별개로 계산한다."],
    },
    mpCost: 80, cooldown: 0, procChance: 50, learnCost: 20000, spCost: 16,
    effects: [{ kind: "damage", scaling: "spi", statCoef: 4.2, attackCoef: 2.6, pierceDamagePct: 15 }, { kind: "heal", scaling: "spi", statCoef: 0.8 }],
  },
  v2c_seraphim_wings: {
    id: "v2c_seraphim_wings", name: "구원의 날개", stat: "int", category: "heal", tier: 3,
    description: "빛의 날개로 자신을 감싸 상처를 치유하고 보호막을 펼친다.",
    detail: {
      mechanics: ["잃은 HP의 30%를 회복하고 최대 HP의 15% 보호막을 3턴 동안 얻는다."],
      limitations: ["기본 패턴은 HP 50% 미만일 때 시전한다. 부활이나 다른 모험가를 회복하는 효과는 없다."],
    },
    mpCost: 100, cooldown: 0, procChance: 100, learnCost: 20000, spCost: 10,
    defaultPattern: { priority: 800, condition: { kind: "self_hp", op: "below", pct: 50 } },
    effects: [{ kind: "heal", pctLostHp: 30 }, { kind: "shield", pctMaxHp: 15, turns: 3 }],
  },
  v2c_seraphim_grace: {
    id: "v2c_seraphim_grace", name: "찬란한 은총", stat: "int", category: "passive", tier: 3,
    description: "빛의 은총으로 정신을 깨우고 치유와 심판의 위력을 높인다.",
    detail: { mechanics: ["정신 35%, 회복량 35%, 마법 스킬 피해 25%, 최대 MP 20% 증가."], limitations: ["일반 회복량 보정은 피해 흡혈에는 적용되지 않는다."] },
    mpCost: 0, cooldown: 0, learnCost: 20000, spCost: 20, effects: [],
    passive: { statPct: { spi: 35 }, healPowerPct: 35, magicSkillDamagePct: 25, maxMpPct: 20 },
  },
  v2c_dragonlord_claw: {
    id: "v2c_dragonlord_claw", name: "용왕의 발톱", stat: "str", category: "attack", tier: 3,
    description: "고대 용의 발톱으로 적의 갑옷을 꿰뚫는다.",
    detail: { mechanics: ["힘과 공격력 기반 물리 피해를 가하며 방어 적용 전 피해의 25%를 관통 피해로 더한다."], limitations: ["대상의 방어력을 감소시키지는 않는다."] },
    mpCost: 70, cooldown: 0, procChance: 50, learnCost: 20000, spCost: 13,
    effects: [{ kind: "damage", statCoef: 3.8, attackCoef: 3.8, primaryStatCoef: 3.2, pierceDamagePct: 25 }],
  },
  v2c_dragonlord_breath: {
    id: "v2c_dragonlord_breath", name: "재앙의 숨결", stat: "int", category: "attack", tier: 3,
    description: "용의 심장에서 끌어올린 화염을 토해 적을 불태운다.",
    detail: { mechanics: ["지능과 마법 공격력 기반 직접 마법 피해를 가하고 연소 1중첩을 부여한다."], synergies: ["고대 용의 심장은 물리·마법 스킬 피해와 연소 피해를 강화한다."], limitations: ["단일 대상 공격이며 기존 연소와 같은 중첩·갱신 규칙을 사용한다."] },
    mpCost: 85, cooldown: 0, procChance: 50, learnCost: 20000, spCost: 15,
    effects: [{ kind: "damage", scaling: "magic", statCoef: 3.8, attackCoef: 3.8, primaryStatCoef: 3.2 }, { kind: "dot", ...V2_DOT_PRESETS.연소 }],
  },
  v2c_dragonlord_heart: {
    id: "v2c_dragonlord_heart", name: "고대 용의 심장", stat: "str", category: "passive", tier: 3,
    description: "고대 용의 심장이 육체와 마력에 불꽃을 불어넣는다.",
    detail: { mechanics: ["물리·마법 스킬 피해 각각 20%, 최대 HP 20%, 연소 피해 50% 증가."], synergies: ["물리 발톱과 마법 브레스를 모두 강화한다. 평타와 회복량에는 스킬 피해 증가가 적용되지 않는다."] },
    mpCost: 0, cooldown: 0, learnCost: 20000, spCost: 18, effects: [],
    passive: { physicalSkillDamagePct: 20, magicSkillDamagePct: 20, maxHpPct: 20, burnDamagePct: 50 },
  },
};
