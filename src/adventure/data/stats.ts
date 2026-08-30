export const STAT_KEYS = ["str", "dex", "vit", "spd", "luk", "int"] as const;
export type StatKey = (typeof STAT_KEYS)[number];

export const STAT_LABELS: Record<StatKey, string> = {
  str: "힘",
  dex: "민첩",
  vit: "활력",
  spd: "속도",
  luk: "행운",
  int: "지능",
};

// SPD → 매 턴 추가 공격 확률(%). 1pt 당 EXTRA_ATTACK_PCT_PER_SPD%, 캡 없음.
// 100% 초과는 정수 부분만큼 확정 추가타, 소수 부분만 확률 굴림 (rollPlayerAttackCount 참조).
// 회피 100% 무적 빌드 견제 + SPD 빌드를 STR/풍사슬 빌드와 어깨를 나란히 하는 메인 라인으로.
export const EXTRA_ATTACK_PCT_PER_SPD = 2;

// 회피 캡 — 100% 회피 무적 빌드 차단. 보장 회피 스킬(소모형 적립, 별도 path)은 캡 무관 100% 회피 유지.
export const EVASION_PCT_CAP = 75;

// 크리티컬 확률 캡 — 회피와 대칭. 캡 초과분은 engine 시점에 크리 데미지로 자동 변환.
// 빌드가 캡 도달 후에도 LUK 투자 의미를 유지(빌드 수렴 방지).
export const CRIT_PCT_CAP = 75;
export const CRIT_OVERFLOW_DMG_PER_PCT = 0.01; // 캡 초과 1%p → 크리뎀 +0.01×
export const CRIT_OVERFLOW_DMG_CAP = 0.5; // 오버플로 크리뎀 기여 최대 +0.5×
