import { multiHitDamage } from "./multiHitDamage";
import { V2_DOT_PRESETS } from "./statusEffects";
import type { V2SkillDefinition } from "./v2Skills";

export type Tier7SecondExpansionSkillId =
  | "v2c_tempest_frostgale" | "v2c_tempest_skystorm" | "v2c_tempest_crown"
  | "v2c_titan_collapse" | "v2c_titan_armor" | "v2c_titan_undying"
  | "v2c_runelord_arcanebolt" | "v2c_runelord_cycle" | "v2c_runelord_sovereign"
  | "v2c_bloodheaven_annihilation" | "v2c_bloodheaven_descent" | "v2c_bloodheaven_immortal"
  | "v2c_behemoth_devour" | "v2c_behemoth_swallow" | "v2c_behemoth_flesh";

/** 기존 공통 효과로 구성하여 사냥·PvP·계승에 같은 규칙을 적용한다.
 * stat은 구 6스탯 분류이므로 정신 계열도 int로 분류한다.
 */
export const TIER7_SECOND_EXPANSION_SKILLS: Record<Tier7SecondExpansionSkillId, V2SkillDefinition> = {
  v2c_tempest_frostgale: {
    id: "v2c_tempest_frostgale", name: "빙뢰 폭풍", stat: "int", category: "attack", tier: 3,
    description: "얼어붙은 폭풍을 내리꽂아 큰 마법 피해를 주고 한기를 쌓는다.",
    detail: {
      mechanics: ["지능과 마법 공격력 기반 직접 마법 피해를 가하고 적중 시 한기를 2중첩 부여한다."],
      synergies: ["영구동토 등 빙결 강화 패시브와 함께 쓰면 빙결 주기가 빨라진다."],
      limitations: ["한기가 빙결 기준에 도달하면 기존 빙결 규칙대로 중첩을 소비한다."],
    },
    mpCost: 110, cooldown: 0, procChance: 40, learnCost: 20000, spCost: 16,
    frostChillGain: 2,
    tier7Mechanic: { kind: "pvpDirectDamage", pvpDirectDamagePct: 111 },
    effects: [{ kind: "damage", scaling: "magic", statCoef: 1.75, attackCoef: 1.75, primaryStatCoef: 1.48, pierceDamagePct: 15 }],
  },
  v2c_tempest_skystorm: {
    id: "v2c_tempest_skystorm", name: "천공 빙풍", stat: "int", category: "buff", tier: 1,
    description: "몸 주위에 칼바람을 둘러 공격을 흘리고 다음 주문을 앞당긴다.",
    detail: {
      mechanics: ["2턴 동안 회피 15%를 얻고 자신의 다음 행동을 25% 앞당긴다."],
      synergies: ["MP 소모가 적어 자주 쓰며, 앞당긴 행동으로 빙뢰 폭풍을 더 자주 노린다."],
      limitations: ["직접 피해는 없다. 기본 패턴은 회피 강화가 남아 있지 않을 때만 시전한다. 기류를 생성하거나 소비하지 않는다."],
    },
    mpCost: 30, cooldown: 0, procChance: 50, learnCost: 20000, spCost: 12,
    defaultPattern: { priority: 600, condition: { kind: "self_buff_pct", target: "evasion", active: false } },
    effects: [
      { kind: "selfBuffPct", target: "evasion", pct: 15, turns: 2 },
      { kind: "selfHaste", pct: 25 },
    ],
  },
  v2c_tempest_crown: {
    id: "v2c_tempest_crown", name: "폭풍의 왕관", stat: "int", category: "passive", tier: 3,
    description: "바람과 냉기를 함께 다스려 주문의 위력과 빙결을 끌어올린다.",
    detail: { mechanics: ["지능 35%, 마법 스킬 피해 25%, 빙결 추가 피해 30%, 최대 HP 10%, 최대 MP 20% 증가."], synergies: ["직업을 바꿔도 장착 중에는 적용된다."] },
    mpCost: 0, cooldown: 0, learnCost: 20000, spCost: 18, effects: [],
    passive: { statPct: { int: 35 }, magicSkillDamagePct: 25, freezeDamagePct: 30, maxHpPct: 10, maxMpPct: 20 },
  },
  v2c_titan_collapse: {
    id: "v2c_titan_collapse", name: "거신 붕괴", stat: "int", category: "attack", tier: 3,
    description: "거대한 몸으로 대지를 내리쳐 적을 짓누르고 행동을 늦춘다.",
    detail: {
      mechanics: ["방어력 기반 물리 피해와 지능 기반 마법 피해를 각각 한 번 가하고 적의 다음 행동을 20% 늦춘다.", "시전 직전 보호막이 있으면 직접 마법 피해가 20% 증가한다."],
      synergies: ["거신의 갑주로 보호막을 유지하면 마법 타격이 강해진다."],
      limitations: ["보호막을 생성하거나 소비하지 않는다."],
    },
    mpCost: 60, cooldown: 0, procChance: 40, learnCost: 20000, spCost: 17,
    shieldedDirectMagicDamagePct: 20,
    effects: [
      { kind: "damage", scaling: "def", statCoef: 2.43, attackCoef: 1.03 },
      { kind: "damage", scaling: "magic", statCoef: 2.43, attackCoef: 2.43, primaryStatCoef: 2.06 },
      { kind: "enemyDelay", pct: 20 },
    ],
  },
  v2c_titan_armor: {
    id: "v2c_titan_armor", name: "거신의 갑주", stat: "vit", category: "buff", tier: 3,
    description: "바위 갑주를 둘러 피해를 흡수하고 상처를 천천히 메운다.",
    detail: {
      mechanics: ["최대 HP의 28% 보호막을 3턴 동안 얻고, 3턴 동안 행동마다 최대 HP의 8%를 회복한다."],
      limitations: ["기본 패턴은 보호막이 없을 때만 시전한다."],
    },
    mpCost: 70, cooldown: 0, procChance: 100, learnCost: 20000, spCost: 11,
    defaultPattern: { priority: 600, condition: { kind: "self_shield", active: false } },
    effects: [{ kind: "shield", pctMaxHp: 28, turns: 3 }, { kind: "selfRegen", pctMaxHpPerTurn: 8, turns: 3 }],
  },
  v2c_titan_undying: {
    id: "v2c_titan_undying", name: "불멸의 거신", stat: "vit", category: "passive", tier: 3,
    description: "닳지 않는 육신과 대지의 마력이 하나가 된다.",
    detail: { mechanics: ["활력 20%, 지능 20%, 최대 HP 24%, 물리·마법 방어력 16% 증가."], synergies: ["직업을 바꿔도 장착 중에는 적용된다."] },
    mpCost: 0, cooldown: 0, learnCost: 20000, spCost: 18, effects: [],
    passive: { statPct: { vit: 20, int: 20 }, maxHpPct: 24, defPct: 16, magicDefPct: 16 },
  },
  v2c_runelord_arcanebolt: {
    id: "v2c_runelord_arcanebolt", name: "만법 비전탄", stat: "int", category: "attack", tier: 3,
    description: "법칙의 룬을 새긴 비전탄으로 적을 꿰뚫고 마력의 흐름을 흐트러뜨린다.",
    detail: {
      mechanics: ["지능과 마법 공격력 기반 직접 마법 피해를 가하고 2턴 동안 적이 받는 피해를 12% 높이며 회복 효과를 30% 줄인다."],
      limitations: ["각인을 생성하거나 소비하지 않는다."],
    },
    mpCost: 130, cooldown: 0, procChance: 40, learnCost: 20000, spCost: 16,
    tier7Mechanic: { kind: "pvpDirectDamage", pvpDirectDamagePct: 94 },
    effects: [
      { kind: "damage", scaling: "magic", statCoef: 1.67, attackCoef: 1.67, primaryStatCoef: 1.41, pierceDamagePct: 10 },
      { kind: "enemyVuln", pct: 12, turns: 2 },
      { kind: "enemyHealReduce", pct: 30, turns: 2 },
    ],
  },
  v2c_runelord_cycle: {
    id: "v2c_runelord_cycle", name: "룬 순환", stat: "int", category: "buff", tier: 1,
    description: "새겨 둔 룬에 마력을 돌려 흩어진 MP를 거두고 다음 주문에 힘을 싣는다.",
    detail: {
      mechanics: ["최대 MP의 15%를 회복하고 2턴 동안 지능 15%를 얻는다."],
      synergies: ["소모 MP보다 회복량이 커서 MP를 많이 쓰는 만법 비전탄을 이어 쓸 수 있게 한다."],
      limitations: ["직접 피해는 없다. 기본 패턴은 지능 강화가 남아 있지 않을 때만 시전한다. MP 회복은 최대 MP를 넘지 않는다."],
    },
    mpCost: 40, cooldown: 0, procChance: 45, learnCost: 20000, spCost: 12,
    defaultPattern: { priority: 600, condition: { kind: "self_buff", stat: "int", active: false } },
    effects: [
      { kind: "manaRestore", pctMaxMp: 15 },
      { kind: "selfBuff", stat: "int", pct: 15, turns: 2 },
    ],
  },
  v2c_runelord_sovereign: {
    id: "v2c_runelord_sovereign", name: "룬의 군주", stat: "int", category: "passive", tier: 3,
    description: "모든 각인과 비전을 손에 넣어 주문을 더 강하고 가볍게 다룬다.",
    detail: { mechanics: ["지능 30%, 마법 스킬 피해 25%, 최대 HP 10%, 최대 MP 20% 증가."], synergies: ["직업을 바꿔도 장착 중에는 적용된다."] },
    mpCost: 0, cooldown: 0, learnCost: 20000, spCost: 18, effects: [],
    passive: { statPct: { int: 30 }, magicSkillDamagePct: 25, maxHpPct: 10, maxMpPct: 20 },
  },
  v2c_bloodheaven_annihilation: {
    id: "v2c_bloodheaven_annihilation", name: "혈천멸세", stat: "str", category: "attack", tier: 3,
    description: "명중 시 현재 HP 12%를 소모해 하늘을 물들이는 일격을 날리고, 준 피해로 생명을 되찾는다.",
    detail: {
      mechanics: ["적중 시 현재 HP를 소모해 소모량에 비례한 추가 피해를 주고, 대상 HP가 35% 이하이면 처형 타격이 강해진다.", "보호막과 HP에 실제로 준 피해의 22%를 회복한다."],
      limitations: ["실제 피해 기반 회복에는 일반 회복량 증가 효과가 다시 적용되지 않는다."],
    },
    mpCost: 20, cooldown: 0, procChance: 40, learnCost: 20000, spCost: 17,
    tier7Mechanic: { kind: "pvpDirectDamage", pvpDirectDamagePct: 96 },
    effects: [
      { kind: "hpCostDamage", pctCurrentHp: 12, soakCurrentHpFloorPct: 50, attackCoef: 2.69, statCoef: 2.69, soakRatio: 2.6 },
      { kind: "executeDamage", attackCoef: 0.82, statCoef: 0.82, hpThresholdPct: 35, bonusMult: 2.3 },
      { kind: "healFromDamage", pct: 22, basis: "actual" },
    ],
  },
  v2c_bloodheaven_descent: {
    id: "v2c_bloodheaven_descent", name: "마신강림", stat: "str", category: "buff", tier: 3,
    description: "마신의 힘을 몸에 내려 받아 힘을 끌어올리고 피해를 견딘다.",
    detail: {
      mechanics: ["3턴 동안 힘 20%, 받는 피해 감소 18%를 얻고 다음 행동을 25% 앞당긴다."],
      limitations: ["기본 패턴은 힘 강화가 남아 있지 않을 때만 시전한다."],
    },
    mpCost: 50, cooldown: 0, procChance: 100, learnCost: 20000, spCost: 11,
    defaultPattern: { priority: 600, condition: { kind: "self_buff", stat: "str", active: false } },
    effects: [
      { kind: "selfBuff", stat: "str", pct: 20, turns: 3 },
      { kind: "selfBuffPct", target: "damageReduction", pct: 18, turns: 3 },
      { kind: "selfHaste", pct: 25 },
    ],
  },
  v2c_bloodheaven_immortal: {
    id: "v2c_bloodheaven_immortal", name: "천마불사", stat: "str", category: "passive", tier: 3,
    description: "마혈과 조화가 하나가 되어 쓰러지지 않는 마신의 육체를 이룬다.",
    detail: { mechanics: ["힘 25%, 활력 15%, 최대 HP 28%, 흡혈 5%, 받는 피해 8% 감소."], limitations: ["흡혈은 실제로 준 직접 피해를 기준으로 하며 일반 회복량 증가 효과가 다시 적용되지 않는다."] },
    mpCost: 0, cooldown: 0, learnCost: 20000, spCost: 18, effects: [],
    passive: { statPct: { str: 25, vit: 15 }, maxHpPct: 28, lifestealPct: 5, damageTakenReductionPct: 8 },
  },
  v2c_behemoth_devour: {
    id: "v2c_behemoth_devour", name: "포식 난무", stat: "str", category: "attack", tier: 3,
    description: "거대한 앞발과 주먹을 네 번 휘둘러 살점을 찢고 상처를 남긴다.",
    detail: {
      mechanics: ["힘 기반 물리 피해를 4회 가하고 출혈 3중첩을 부여한다."],
      synergies: ["출혈 10중첩을 빠르게 만들어 대지 삼킴과 원시 포식자 계열 스킬의 추가 효과를 연다. 천룡의 호흡을 장착하면 각 타격이 공유 타격 수를 올린다."],
      limitations: ["각 타격은 따로 방어의 영향을 받는다. 출혈은 기존 중첩·갱신 규칙을 따른다."],
    },
    mpCost: 35, cooldown: 0, procChance: 65, learnCost: 20000, spCost: 14,
    tier7Mechanic: { kind: "pvpDirectDamage", pvpDirectDamagePct: 80 },
    effects: [
      ...multiHitDamage({ hitCount: 4, totalStatCoef: 1.97, totalBaseFlat: 0, totalPrimaryStatCoef: 2.82 }),
      { kind: "dot", ...V2_DOT_PRESETS.출혈, stacks: 3 },
    ],
  },
  v2c_behemoth_swallow: {
    id: "v2c_behemoth_swallow", name: "대지 삼킴", stat: "str", category: "attack", tier: 3,
    description: "피 흘리는 사냥감을 통째로 삼킬 듯 덮쳐 큰 피해를 주고 상처를 벌린다.",
    detail: {
      mechanics: ["힘과 공격력 기반 단일 물리 피해를 가한다.", "출혈 10중첩인 대상에게는 방어 관통 15%를 적용하고 실제로 준 피해의 10%를 회복한다."],
      synergies: ["포식 난무로 출혈을 쌓은 뒤 쓰면 모든 추가 효과가 열린다."],
      limitations: ["대상의 출혈이 10중첩보다 낮으면 관통·회복이 적용되지 않는다. 실제 피해 기반 회복에는 일반 회복량 증가 효과가 다시 적용되지 않는다."],
    },
    mpCost: 90, cooldown: 0, procChance: 40, learnCost: 20000, spCost: 16, tempo: "payoff",
    tier7Mechanic: { kind: "pvpDirectDamage", pvpDirectDamagePct: 80 },
    effects: [
      { kind: "damage", statCoef: 5.13, attackCoef: 5.13, primaryStatCoef: 4.13 },
    ],
    bleedHunt: { minStacks: 10, skillPenetrationPct: 15, skillActualDamageHealPct: 10 },
  },
  v2c_behemoth_flesh: {
    id: "v2c_behemoth_flesh", name: "거수의 혈육", stat: "str", category: "passive", tier: 3,
    description: "원시의 육체와 천룡의 호흡이 하나가 되어 거수의 힘을 낸다.",
    detail: {
      mechanics: ["힘 25%, 민첩 15%, 최대 HP 10%, 물리 스킬 피해 18% 증가.", "출혈 10중첩인 대상에게 주는 직접 물리 피해가 8% 증가한다."],
      synergies: ["직업을 바꿔도 장착 중에는 적용된다. 원시 포식자의 야수의 정점과 같은 출혈 10중첩 조건을 쓴다."],
    },
    mpCost: 0, cooldown: 0, learnCost: 20000, spCost: 14, effects: [],
    passive: { statPct: { str: 25, dex: 15 }, maxHpPct: 10, physicalSkillDamagePct: 18 },
    bleedHunt: { minStacks: 10, directPhysicalDamagePct: 8 },
  },
};
