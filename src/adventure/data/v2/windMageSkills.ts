import type { V2SkillDefinition } from "./v2Skills";

export type WindMageSkillId =
  | "v2c_aeromancer_blade" | "v2c_aeromancer_spirit" | "v2c_aeromancer_current"
  | "v2c_stormbringer_burst" | "v2c_stormbringer_will" | "v2c_stormbringer_current";

export const WIND_MAGE_SKILLS: Record<WindMageSkillId, V2SkillDefinition> = {
  v2c_aeromancer_blade: {
    id: "v2c_aeromancer_blade", name: "에어 블레이드", stat: "int", category: "attack", tier: 3,
    description: "날카로운 바람을 날리고 기류를 타 다음 행동을 앞당긴다.",
    detail: { mechanics: ["단일 마법 피해와 다음 행동 35% 가속. 기류 패시브 장착 시 적중 후 기류 1개 생성(최대 3)."], limitations: ["현재 주문은 생성 전 기류로 강화된다."] },
    mpCost: 52, cooldown: 0, procChance: 30, learnCost: 8000,
    windCurrent: { kind: "gather" },
    effects: [{ kind: "damage", scaling: "magic", statCoef: 2.65, attackCoef: 2.65, primaryStatCoef: 2 }, { kind: "selfHaste", pct: 35 }],
  },
  v2c_aeromancer_spirit: {
    id: "v2c_aeromancer_spirit", name: "바람의 정신", stat: "int", category: "passive", tier: 3,
    description: "새로 모인 기류에서 마력을 회수한다.",
    detail: { mechanics: ["실제로 얻은 기류 1개당 최대 MP의 1% 회복 및 최대 MP의 5% 보호막 획득."], limitations: ["기류 생성 패시브 장착 필요. 최대 중첩에서 더 얻지 못한 기류는 회복에 포함하지 않는다."] },
    mpCost: 0, cooldown: 0, learnCost: 8000, effects: [],
    passive: { windCurrentMpRestorePctPerStack: 1, windCurrentShieldPctPerStack: 5 },
  },
  v2c_aeromancer_current: {
    id: "v2c_aeromancer_current", name: "기류 제어", stat: "int", category: "passive", tier: 3,
    description: "바람 주문으로 기류를 쌓아 다음 바람 주문을 강화한다.",
    detail: { mechanics: ["질풍술·에어 블레이드 적중 시 기류 1개 생성(최대 3). 기류당 질풍술·에어 블레이드·템페스트 버스트 직접 피해 8% 증가."], synergies: ["폭풍 순환과 합산된다. 직업·속성에 관계없이 장착 시 적용."] },
    mpCost: 0, cooldown: 0, learnCost: 8000, effects: [], passive: { windCurrentDamagePctPerStack: 8 },
  },
  v2c_stormbringer_burst: {
    id: "v2c_stormbringer_burst", name: "템페스트 버스트", stat: "int", category: "attack", tier: 3,
    description: "모아 둔 기류를 거대한 폭풍으로 터뜨린다.",
    detail: { mechanics: ["단일 마법 피해. 적중 시 기류를 전부 소비하며 소비량당 자체 피해 20%, 다음 행동 가속 15%(최대 45%)를 얻는다."], synergies: ["기류 패시브의 피해 증가와 합산된다."], limitations: ["기류가 없어도 기본 피해를 준다. 빗나가면 소비·소비 가속이 발생하지 않는다."] },
    mpCost: 64, cooldown: 0, procChance: 30, learnCost: 12000,
    windCurrent: { kind: "release", damagePctPerStack: 20, hastePctPerStack: 15 },
    defaultPattern: { priority: 510, condition: { kind: "self_resource", resource: "windCurrent", op: "atLeast", value: 3 } },
    effects: [{ kind: "damage", scaling: "magic", statCoef: 4.15, attackCoef: 4.15, primaryStatCoef: 3.5 }],
  },
  v2c_stormbringer_will: {
    id: "v2c_stormbringer_will", name: "폭풍의 의지", stat: "int", category: "passive", tier: 3,
    description: "폭풍이 지나간 흐름을 붙잡아 다음 기류를 빠르게 모은다.",
    detail: { mechanics: ["템페스트 버스트로 기류 3개를 소비하면 다음 적중한 질풍술·에어 블레이드의 기류 생성량 +1 및 확정 회피 1회 확보."], limitations: ["기류 생성 패시브 장착 필요. 최대 기류는 3개이며, 일반 주문·미적중은 준비를 소모하지 않는다.", "이 효과의 확정 회피는 누적되지 않는다. 이미 1회 이상 보유했다면 기존 횟수를 유지한다."] },
    mpCost: 0, cooldown: 0, learnCost: 12000, effects: [],
    passive: { windCurrentRebound: true, windCurrentReleaseEvades: 1 },
  },
  v2c_stormbringer_current: {
    id: "v2c_stormbringer_current", name: "폭풍 순환", stat: "int", category: "passive", tier: 3,
    description: "폭풍의 흐름을 순환시켜 기류에 더 큰 힘을 싣는다.",
    detail: { mechanics: ["질풍술·에어 블레이드 적중 시 기류 1개 생성(최대 3). 기류당 질풍술·에어 블레이드·템페스트 버스트 직접 피해 12% 증가."], synergies: ["기류 제어와 합산하여 기류당 20% 증가. 직업·속성에 관계없이 장착 시 적용."] },
    mpCost: 0, cooldown: 0, learnCost: 12000, effects: [], passive: { windCurrentDamagePctPerStack: 12 },
  },
};
