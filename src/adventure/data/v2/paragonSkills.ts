import type { V2SkillDefinition } from "./v2Skills";
import { V2_DIRECT_SKILL_STAT_COEF_MULT } from "@/adventure/v2/combat/combatPattern";

export type ParagonSkillId = "v2c_paragon_form" | "v2c_paragon_breakpoint" | "v2c_paragon_mastery";
export const PARAGON_SKILLS: Record<ParagonSkillId, V2SkillDefinition> = {
  v2c_paragon_form: {
    id: "v2c_paragon_form", name: "퍼펙트 폼", stat: "str", category: "buff", tier: 3,
    description: "모든 능력을 하나의 자세에 담아 다음 평타 6회를 강화한다.",
    detail: { mechanics: ["방어 적용 전 평타 피해에 모든 능력치 합계 ×0.15 추가(현재 공격력의 40% 상한)."], synergies: ["장착한 하위 선언의 효과를 합성한다. 추가 피해에도 방어와 치명타가 적용된다."] },
    // 공통 절대자 계보 MP 압박 배율 1.25 적용 후 각각 90/150 MP.
    mpCost: 72, fixedMpCost: 72, cooldown: 8, procChance: 100, spCost: 20, learnCost: 20000,
    effects: [], duelistDeclaration: { rank: 5, hits: 6, basicAllStatCoef: 0.15, basicAllStatAtkCapPct: 40 },
  },
  v2c_paragon_breakpoint: {
    id: "v2c_paragon_breakpoint", name: "브레이크 포인트", stat: "str", category: "attack", tier: 3,
    description: "힘을 모아 빈틈을 찌르고 상대의 다음 공격을 약화한다.",
    detail: { mechanics: ["공격력 ×3 + 모든 능력치 합계 ×0.2의 단일 물리 피해. 적중 시 상대의 다음 적중한 직접 공격 피해 30% 감소."], limitations: ["약화는 중첩 없이 갱신된다. 다단 스킬은 시전 전체, 평타는 1회에 적용. 회복·대기·지속 피해는 소비하지 않는다.", "선언의 남은 평타 횟수를 소비하지 않는다."] },
    mpCost: 120, fixedMpCost: 120, cooldown: 0, procChance: 30, spCost: 16, learnCost: 20000,
    effects: [{ kind: "damage", scaling: "all", attackCoef: 3, statCoef: 0.2 / V2_DIRECT_SKILL_STAT_COEF_MULT }, { kind: "enemyDamageDown", pct: 30, turns: 1, nextAttackOnly: true }],
  },
  v2c_paragon_mastery: {
    id: "v2c_paragon_mastery", name: "완성된 기량", stat: "str", category: "passive", tier: 3,
    description: "선언과 공격 사이의 흐름을 이어 간다.",
    detail: { mechanics: ["선언 시전 직후 기본 공격 1회. 새 선언의 효과를 받고 남은 평타 횟수를 1회 소비한다.", "선언 유지 중 공격 스킬을 사용해도 연속 평타 누적 단계가 초기화되지 않는다."], limitations: ["물약이나 다른 버프 사용 시에는 기존처럼 연속 단계가 초기화된다."] },
    mpCost: 0, cooldown: 0, spCost: 12, learnCost: 20000, effects: [], passive: { paragonMastery: true },
  },
};
