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
// 캡 초과분은 derive 시점에 방어 무시(armorPierce)로 자동 변환 — "더 찍을 이유" 보존.
export const EVASION_PCT_CAP = 75;
export const EVA_OVERFLOW_PIERCE_PER_PCT = 0.005; // 캡 초과 1%p → 방어 무시 +0.5%
export const EVA_OVERFLOW_PIERCE_CAP = 0.2; // 오버플로 기여 최대 20% (정확 스킬과 별개 가산)

// 크리티컬 확률 캡 — 회피와 대칭. 캡 초과분은 engine 시점에 크리 데미지로 자동 변환.
// 빌드가 캡 도달 후에도 LUK 투자 의미를 유지(빌드 수렴 방지).
export const CRIT_PCT_CAP = 75;
export const CRIT_OVERFLOW_DMG_PER_PCT = 0.02; // 캡 초과 1%p → 크리뎀 +0.02×
export const CRIT_OVERFLOW_DMG_CAP = 1.0; // 오버플로 크리뎀 기여 최대 +1.0×

// 스탯 1pt 당 전투 수치 환산 — UI 도감 노출용 설명.
export const STAT_CONVERSIONS: Record<StatKey, string> = {
  str: "1pt 당 공격력 +1",
  dex: `1pt 당 회피 +0.5% (최대 ${EVASION_PCT_CAP}%, 초과분은 방어 무시로 전환) / 3pt 당 공격력 +1`,
  vit: "1pt 당 방어력 +1 / 1pt 당 최대 HP +3 / 방어력 5 당 공격력 +1 (방어구 합산)",
  spd: `1pt 당 추가 공격 확률 +${EXTRA_ATTACK_PCT_PER_SPD}% (100% 초과 시 추가타 1회 확정) / 5pt 당 공격력 +1`,
  luk: `1pt 당 드랍률 +1% / 1pt 당 크리티컬 확률 +0.5% (최대 ${CRIT_PCT_CAP}%, 초과분은 크리 데미지로 전환) / 1pt 당 크리티컬 데미지 +0.025배 / 3pt 당 공격력 +1`,
  int: "현재 전투 효과 없음. 추후 마법 데미지와 MP 에 사용됩니다.",
};

// 도감에서 스탯별 스킬 정보를 공개하는 임계값.
// 모든 스탯 공통 — 5pt 도달 시 그 스탯이 주는 스킬의 이름·설명이 공개된다.
// (스킬 실제 활성 임계는 스탯별로 다를 수 있음 — skills.ts 의 STAT_SKILL 참조.)
export const STAT_SKILL_INFO_THRESHOLD = 5;

// 도감에서 2차 스킬 정보를 공개하는 임계값. (환산 정보는 항상 공개.)
export const STAT_REVEAL_THRESHOLD = 15;

// 3차 스킬 정보를 공개하는 임계값. 활성은 35 — gap 5.
export const STAT_TIER3_REVEAL_THRESHOLD = 30;

// 4차 스킬 정보를 공개하는 임계값. 활성은 50 — gap 5.
export const STAT_TIER4_REVEAL_THRESHOLD = 45;

// 5차 스킬 정보를 공개하는 임계값. 활성은 65 — gap 5. (만렙 확장 Lv100 패키지)
export const STAT_TIER5_REVEAL_THRESHOLD = 60;

// 6차 스킬 정보를 공개하는 임계값. 활성은 85 — gap 5. (만렙 확장 Lv100 패키지)
export const STAT_TIER6_REVEAL_THRESHOLD = 80;
