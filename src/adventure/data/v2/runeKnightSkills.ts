import type { V2SkillDefinition } from "./v2Skills";

export type RuneKnightSkillId =
  | "v2c_spellswordmaster_flurry"
  | "v2c_spellswordmaster_dualmark"
  | "v2c_spellswordmaster_fissure"
  | "v2c_spellswordemperor_release"
  | "v2c_spellswordemperor_unity"
  | "v2c_spellswordemperor_rift";

/** 룬 기사 계보 5·6차 — 물리와 마법을 함께 때리고 양쪽 방어를 함께 깎는다. 신규 엔진 규칙 없음. */
export const RUNE_KNIGHT_SKILLS: Record<RuneKnightSkillId, V2SkillDefinition> = {
  v2c_spellswordmaster_flurry: {
    id: "v2c_spellswordmaster_flurry", name: "룬 연격", stat: "str", category: "attack", tier: 3,
    description: "검에 새긴 룬을 차례로 터뜨리며 베고, 찌르고, 다시 벤다.",
    detail: {
      mechanics: ["물리·마법·물리 순서로 세 번 타격한다. 물리 타격은 공격력과 힘, 마법 타격은 마법 공격력과 지능을 따른다."],
      limitations: ["물리 타격은 물리 방어, 마법 타격은 마법 방어로 각각 줄어든다."],
    },
    mpCost: 54, cooldown: 0, procChance: 30, learnCost: 8000,
    effects: [
      { kind: "damage", statCoef: 0.95, attackCoef: 0.95, primaryStatCoef: 0.7 },
      { kind: "damage", scaling: "magic", statCoef: 0.95, attackCoef: 0.95, primaryStatCoef: 0.7 },
      { kind: "damage", statCoef: 0.95, attackCoef: 0.95, primaryStatCoef: 0.7 },
    ],
  },
  v2c_spellswordmaster_dualmark: {
    id: "v2c_spellswordmaster_dualmark", name: "이중 각인", stat: "str", category: "passive", tier: 3,
    description: "검날 양면에 서로 다른 룬을 새긴다. 힘과 지능이 함께 오르고 두 종류의 타격이 모두 날카로워진다.",
    detail: { mechanics: ["모든 직업에서 힘·지능 16%, 물리 스킬 피해 6%, 마법 스킬 피해 6% 증가."] },
    mpCost: 0, cooldown: 0, learnCost: 8000, effects: [],
    passive: { statPct: { str: 16, int: 16 }, physicalSkillDamagePct: 6, magicSkillDamagePct: 6 },
  },
  v2c_spellswordmaster_fissure: {
    id: "v2c_spellswordmaster_fissure", name: "균열 간파", stat: "str", category: "passive", tier: 3,
    description: "갑주의 이음매와 마력의 결을 함께 읽어 두 방어를 조금씩 무너뜨린다.",
    detail: {
      mechanics: ["모든 직업에서 적 물리 방어와 마법 방어를 각각 8% 낮춘다."],
      synergies: ["갑주 간파·마력 해체와 함께 장착하면 남은 방어력에 차례로 적용한다."],
    },
    // 갑주 간파 II(물리 11%·7 SP)보다 한쪽 효율은 낮게, 양쪽을 함께 쓰는 빌드에만 이득이 되게 값을 고정한다.
    mpCost: 0, cooldown: 0, learnCost: 8000, spCost: 6, effects: [],
    passive: { enemyPhysicalDefReductionPct: 8, enemyMagicDefReductionPct: 8 },
  },
  v2c_spellswordemperor_release: {
    id: "v2c_spellswordemperor_release", name: "마검 해방", stat: "str", category: "attack", tier: 3,
    description: "봉인한 룬을 모두 풀어 검과 마력을 한 번에 내리친다. 갈라진 방어는 한동안 닫히지 않는다.",
    detail: {
      mechanics: ["강한 물리 타격과 마법 타격을 한 번씩 준다. 각 타격은 방어 적용 전 피해의 15%를 방어 무시 추가 피해로 더한다.", "대상에게 취약 14%를 3행동 동안 건다."],
      limitations: ["관통은 추가 피해이며 대상의 방어력을 낮추지 않는다. 취약은 중첩되지 않고 지속시간을 갱신한다."],
    },
    mpCost: 64, cooldown: 0, procChance: 30, learnCost: 12000,
    effects: [
      { kind: "damage", statCoef: 2.4, attackCoef: 2.4, primaryStatCoef: 1.9, pierceDamagePct: 15 },
      { kind: "damage", scaling: "magic", statCoef: 2.4, attackCoef: 2.4, primaryStatCoef: 1.9, pierceDamagePct: 15 },
      { kind: "enemyVuln", pct: 14, turns: 3 },
    ],
  },
  v2c_spellswordemperor_unity: {
    id: "v2c_spellswordemperor_unity", name: "만룬 합일", stat: "str", category: "passive", tier: 3,
    description: "몸에 새긴 모든 룬이 하나로 이어진다. 힘과 지능이 크게 오르고 치명적인 빈틈을 놓치지 않는다.",
    detail: { mechanics: ["모든 직업에서 힘·지능 20%, 치명타 확률 6% 증가."] },
    mpCost: 0, cooldown: 0, learnCost: 12000, effects: [],
    passive: { statPct: { str: 20, int: 20 }, critPct: 6 },
  },
  v2c_spellswordemperor_rift: {
    id: "v2c_spellswordemperor_rift", name: "룬 균열", stat: "str", category: "passive", tier: 3,
    description: "베는 자리마다 룬의 균열을 남겨 갑주와 마력 장벽을 함께 갈라 놓는다.",
    detail: {
      mechanics: ["모든 직업에서 적 물리 방어와 마법 방어를 각각 12% 낮춘다."],
      synergies: ["균열 간파·갑주 간파·마력 해체와 함께 장착하면 남은 방어력에 차례로 적용한다."],
    },
    // 갑주 간파 III(물리 13%·9 SP)와 같은 값 — 한쪽만 쓰면 손해, 양쪽을 쓰면 이득.
    mpCost: 0, cooldown: 0, learnCost: 12000, spCost: 9, effects: [],
    passive: { enemyPhysicalDefReductionPct: 12, enemyMagicDefReductionPct: 12 },
  },
};
