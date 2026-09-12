import type { V2SkillDefinition } from "./v2Skills";

export type EarthMageSkillId =
  | "v2c_geomancer_upheaval"
  | "v2c_geomancer_heart"
  | "v2c_geomancer_barrier"
  | "v2c_tectomancer_cataclysm"
  | "v2c_tectomancer_resolve"
  | "v2c_tectomancer_ground";

export const EARTH_MAGE_SKILLS: Record<EarthMageSkillId, V2SkillDefinition> = {
  v2c_geomancer_upheaval: {
    id: "v2c_geomancer_upheaval", name: "지맥 융기", stat: "int", category: "attack", tier: 3,
    description: "지맥을 솟구치게 해 적을 타격하고 두꺼운 암반으로 몸을 감싼다.",
    detail: {
      mechanics: ["단일 마법 피해와 최대 HP 24%의 보호막을 제공한다. 보호막은 기존 잔량에 더해지며 피해로 소진될 때까지 유지된다."],
      synergies: ["암반 결계로 생성량을 높이고, 다음 공격부터 보호막 조건부 마법 피해 증가를 활용할 수 있다."],
      limitations: ["적의 행동을 지연하지 않는다. 이 시전으로 새로 얻은 보호막은 이번 공격의 조건부 증폭에 사용하지 않는다."],
    },
    mpCost: 52, cooldown: 0, procChance: 30, learnCost: 8000,
    effects: [
      { kind: "damage", scaling: "magic", statCoef: 2.45, attackCoef: 2.45, primaryStatCoef: 1.8 },
      { kind: "shield", pctMaxHp: 24, turns: 3 },
    ],
  },
  v2c_geomancer_heart: {
    id: "v2c_geomancer_heart", name: "지맥의 심장", stat: "int", category: "passive", tier: 3,
    description: "지맥의 마력을 받아 지성과 정신을 단련하고 생명력을 높인다.",
    detail: { mechanics: ["모든 직업에서 지능 20%, 정신 15%, 최대 HP 12% 증가. 증가한 최대 HP는 HP 비례 보호막의 기준에도 반영된다."] },
    mpCost: 0, cooldown: 0, learnCost: 8000, effects: [],
    passive: { statPct: { int: 20, spi: 15 }, maxHpPct: 12 },
  },
  v2c_geomancer_barrier: {
    id: "v2c_geomancer_barrier", name: "암반 결계", stat: "int", category: "passive", tier: 3,
    description: "보호 주문에 암반의 힘을 더해 새로 펼치는 보호막을 강화한다.",
    detail: {
      mechanics: ["모든 직업에서 직접 시전하는 스킬의 보호막 생성량이 30% 증가한다."],
      limitations: ["기존 보호막 잔량, 장비의 전투 시작·회복 전환 보호막, 피격 시 MP를 소모하는 마나 실드는 강화하지 않는다."],
    },
    mpCost: 0, cooldown: 0, learnCost: 8000, effects: [],
    passive: { skillShieldPowerPct: 30 },
  },
  v2c_tectomancer_cataclysm: {
    id: "v2c_tectomancer_cataclysm", name: "천지 붕괴", stat: "int", category: "attack", tier: 3,
    description: "지각을 무너뜨려 적을 짓누른다. 보호막이 몸을 지키고 있으면 더 강한 마력을 쏟아낸다.",
    detail: {
      mechanics: ["단일 마법 피해와 적 다음 행동 20% 지연. 시전 직전 보호막이 있으면 직접 마법 피해가 20% 증가한다."],
      synergies: ["불동의 터와 함께 장착하면 보호막 유지 중 직접 마법 피해가 합산 40% 증가한다."],
      limitations: ["보호막을 생성하거나 소모하지 않는다. 잔량과 출처는 공격 보너스의 크기를 바꾸지 않는다."],
    },
    mpCost: 64, cooldown: 0, procChance: 30, learnCost: 12000,
    shieldedDirectMagicDamagePct: 20,
    effects: [
      { kind: "damage", scaling: "magic", statCoef: 3.45, attackCoef: 3.45, primaryStatCoef: 2.8 },
      { kind: "enemyDelay", pct: 20 },
    ],
  },
  v2c_tectomancer_resolve: {
    id: "v2c_tectomancer_resolve", name: "태산의 의지", stat: "int", category: "passive", tier: 3,
    description: "태산처럼 흔들리지 않는 의지로 마력과 생명력, 물리·마법 방어를 단단히 다진다.",
    detail: { mechanics: ["모든 직업에서 지능 25%, 최대 HP 16%, 물리 방어력 18%, 마법 방어력 18% 증가."] },
    mpCost: 0, cooldown: 0, learnCost: 12000, effects: [],
    passive: { statPct: { int: 25 }, maxHpPct: 16, defPct: 18, magicDefPct: 18 },
  },
  v2c_tectomancer_ground: {
    id: "v2c_tectomancer_ground", name: "불동의 터", stat: "int", category: "passive", tier: 3,
    description: "보호막이 지키는 터 위에서 흔들림 없이 공격 주문에 힘을 싣는다.",
    detail: {
      mechanics: ["모든 직업에서 시전 직전 보호막이 있으면 직접 마법 스킬 피해가 20% 증가한다. 일반 마법 스킬 피해 증가와 합산한다."],
      limitations: ["일반 공격, 물리 피해, 지속 피해, 반사, 장비 후속 피해, 빙결 추가 피해에는 적용되지 않는다. 피격 시 MP를 소모하는 마나 실드는 조건에 포함하지 않는다."],
    },
    mpCost: 0, cooldown: 0, learnCost: 12000, effects: [],
    passive: { shieldedMagicSkillDamagePct: 20 },
  },
};
