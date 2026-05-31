// v2 상태이상(status effect) 카탈로그 — PR-9. 디버프 시스템 정식화.
//
// 두 갈래만:
//   - DoT (지속피해): 출혈·중독·소각 — 매 턴 flat 피해(DEF 무시). label 중복 시 turns refresh.
//   - 스탯 디버프: 둔화(속도−)·약화(공격 stat−)·무력(방어 vit−).
// **행동불가(기절·빙결·턴 스킵)는 의도적으로 제외** — 턴 주고받는 자동전투에 과함(사용자 결정).
//
// 프리셋은 순수 데이터(v2Skills 미import — 순환 방지). v2Skills 가 spread 로 effect 를 만든다.
// 단일 튜닝 source — 같은 상태이상은 어디서 걸든 같은 수치.

import type { StatKey } from "@/adventure/data/stats";

// DoT 프리셋 — { label, dmgPerTurn, turns }. label = 상태이상 이름(전투 dot 키).
//   출혈: 강하고 짧게 / 중독: 약하고 길게 / 소각: 폭발적·아주 짧게.
export const V2_DOT_PRESETS = {
  출혈: { label: "출혈" as const, dmgPerTurn: 6, turns: 3 },
  중독: { label: "중독" as const, dmgPerTurn: 4, turns: 5 },
  소각: { label: "소각" as const, dmgPerTurn: 8, turns: 2 },
} as const;
export type V2DotName = keyof typeof V2_DOT_PRESETS;

// 스탯 디버프 프리셋 — { stat, pct, turns }. 행동은 하되 약해진다(행동불가 아님).
//   둔화: 속도− / 약화: 힘−(공격) / 무력: 활력−(방어).
export const V2_DEBUFF_PRESETS = {
  둔화: { stat: "spd" as StatKey, pct: 16, turns: 3 },
  약화: { stat: "str" as StatKey, pct: 16, turns: 3 },
  무력: { stat: "vit" as StatKey, pct: 15, turns: 3 },
} as const;
export type V2DebuffName = keyof typeof V2_DEBUFF_PRESETS;

// 표시용 — 전투 UI/로그가 상태이상을 사람이 읽게.
export const V2_STATUS_KINDS = {
  출혈: "dot",
  중독: "dot",
  소각: "dot",
  둔화: "debuff",
  약화: "debuff",
  무력: "debuff",
} as const;
export type V2StatusName = keyof typeof V2_STATUS_KINDS;
