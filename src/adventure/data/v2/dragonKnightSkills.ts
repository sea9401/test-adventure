import type { V2SkillDefinition } from "./v2Skills";

export type DragonKnightSkillId =
  | "v2c_dragonknight_fang" | "v2c_dragonknight_blood"
  | "v2c_drakeblood_roar" | "v2c_drakeblood_scales"
  | "v2c_dragonwing_assault" | "v2c_dragonwing_spirit"
  | "v2c_dragonsovereign_breath" | "v2c_dragonsovereign_heart";

export const DRAGON_KNIGHT_SKILLS: Record<DragonKnightSkillId, V2SkillDefinition> = {
  v2c_dragonknight_fang: {
    id: "v2c_dragonknight_fang", name: "용아 찌르기", stat: "str", category: "attack", tier: 3,
    description: "팔에 돋아난 용의 비늘로 무기를 받쳐 적의 방어를 꿰뚫는다.",
    detail: { mechanics: ["단일 물리 피해에 방어력 적용 전 피해의 25%를 관통 피해로 더한다."], limitations: ["관통은 추가 피해이며 대상의 방어력을 감소시키지 않는다."] },
    mpCost: 42, cooldown: 0, procChance: 30, learnCost: 4000,
    effects: [{ kind: "damage", statCoef: 2.05, attackCoef: 2.05, primaryStatCoef: 1.3, pierceDamagePct: 25 }],
  },
  v2c_dragonknight_blood: {
    id: "v2c_dragonknight_blood", name: "용혈", stat: "str", category: "passive", tier: 3,
    description: "용의 피가 힘을 깨우고 육체를 단단하게 지킨다.",
    detail: { mechanics: ["모든 직업에서 힘 12%, 물리·마법 방어력 10% 증가."] },
    mpCost: 0, cooldown: 0, learnCost: 4000, effects: [],
    passive: { statPct: { str: 12 }, defPct: 10 },
  },
  v2c_drakeblood_roar: {
    id: "v2c_drakeblood_roar", name: "용의 포효", stat: "str", category: "buff", tier: 3,
    description: "용의 위압을 담아 포효하여 투지를 끌어올리고 적의 공격을 위축시킨다.",
    detail: { mechanics: ["자신에게 힘 계열 공격 강화 20%, 적에게 주는 피해 감소 15%를 각각 3턴 적용한다."], limitations: ["직접 피해는 없으며 재시전은 지속시간을 갱신한다."] },
    mpCost: 48, cooldown: 0, procChance: 100, learnCost: 5000,
    effects: [{ kind: "selfBuff", stat: "str", pct: 20, turns: 3 }, { kind: "enemyDamageDown", pct: 15, turns: 3 }],
    defaultPattern: { priority: 600, condition: { kind: "self_buff", stat: "str", active: false } },
  },
  v2c_drakeblood_scales: {
    id: "v2c_drakeblood_scales", name: "용린 갑주", stat: "vit", category: "passive", tier: 3,
    description: "피부 위로 단단한 용린이 돋아 육체를 보호한다.",
    detail: { mechanics: ["모든 직업에서 활력 18% 증가, 받는 피해 3% 감소."] },
    mpCost: 0, cooldown: 0, learnCost: 5000, effects: [],
    passive: { statPct: { vit: 18 }, damageTakenReductionPct: 3 },
  },
  v2c_dragonwing_assault: {
    id: "v2c_dragonwing_assault", name: "용익 강습", stat: "str", category: "attack", tier: 3,
    description: "등에서 펼친 용의 날개로 돌진하여 적을 짓누르고 다음 행동을 늦춘다.",
    detail: { mechanics: ["강한 단일 물리 피해를 주고 적의 다음 행동을 35% 지연한다."], limitations: ["행동 지연은 ATB 전투에 적용되며 공중 무적이나 회피를 부여하지 않는다."] },
    mpCost: 54, cooldown: 0, procChance: 30, learnCost: 8000,
    effects: [{ kind: "damage", statCoef: 2.75, attackCoef: 2.75, primaryStatCoef: 2 }, { kind: "enemyDelay", pct: 35 }],
  },
  v2c_dragonwing_spirit: {
    id: "v2c_dragonwing_spirit", name: "용의 기백", stat: "str", category: "passive", tier: 3,
    description: "용의 기백으로 힘을 끌어올리고 치명상을 깊게 새긴다.",
    detail: { mechanics: ["모든 직업에서 힘 20%, 기본 공격 치명타 피해 25%, 스킬 치명타 피해 15% 증가."] },
    mpCost: 0, cooldown: 0, learnCost: 8000, effects: [],
    passive: { statPct: { str: 20 }, critDmgPct: 25, skillCritDmgPct: 15 },
  },
  v2c_dragonsovereign_breath: {
    id: "v2c_dragonsovereign_breath", name: "용왕의 숨결", stat: "vit", category: "attack", tier: 3,
    description: "용의 심장에서 끌어올린 힘을 압축해 거대한 숨결로 토해 낸다.",
    detail: { mechanics: ["공격력과 활력에 비례한 강력한 단일 물리 피해를 준다."], synergies: ["힘으로 높인 공격력과 활력을 함께 활용한다. 별도 자원 없이 시전한다."], limitations: ["화염 마법이나 광역 공격이 아닌 물리 브레스다."] },
    mpCost: 64, cooldown: 0, procChance: 30, learnCost: 12000,
    effects: [{ kind: "damage", statCoef: 4, attackCoef: 3, scaling: "vit" }],
  },
  v2c_dragonsovereign_heart: {
    id: "v2c_dragonsovereign_heart", name: "용왕의 심장", stat: "vit", category: "passive", tier: 3,
    description: "용왕의 심장이 온몸에 강대한 생명력을 보낸다.",
    detail: { mechanics: ["모든 직업에서 힘과 활력이 각각 30%, 최대 HP가 20% 증가하고 받는 피해가 5% 감소."] },
    mpCost: 0, cooldown: 0, learnCost: 12000, effects: [],
    passive: { statPct: { str: 30, vit: 30 }, maxHpPct: 20, damageTakenReductionPct: 5 },
  },
};
