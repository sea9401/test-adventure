// 원소 이름/색상용 메타데이터. 속성 상성은 2026-07-19 폐지했다.
// 기존 저장값과 스킬 카탈로그의 연출 태그를 안전하게 읽기 위해 id·라벨·파서는 유지하지만,
// 캐릭터/몬스터 속성에 따른 피해 배율이나 유불리는 더 이상 발생하지 않는다.

export const V2_ELEMENTS = [
  "neutral",
  "water",
  "fire",
  "wind",
  "starlight",
  "void",
  "earth",
  "lightning",
] as const;

export type V2Element = (typeof V2_ELEMENTS)[number];

export const V2_ELEMENT_LABEL: Record<V2Element, string> = {
  neutral: "무속성",
  water: "물",
  fire: "불",
  wind: "바람",
  starlight: "빛",
  void: "어둠",
  earth: "대지",
  lightning: "번개",
};

// 구 호출부와 저장 형식의 단계적 호환을 위한 중립 상수. 모든 속성 배율은 1이다.
export const V2_ELEMENT_ADV_PCT = 0;
export const V2_ELEMENT_DIS_PCT = 0;
export const V2_ELEMENT_ADV_PCT_PVP = 0;
export const V2_ELEMENT_DIS_PCT_PVP = 0;

export type ElementMatchup = "advantage" | "disadvantage" | "neutral";

export function elementMatchup(
  _attacker: V2Element,
  _defender: V2Element,
): ElementMatchup {
  return "neutral";
}

// 공격자·피격자의 옛 속성 값과 관계없이 피해 배율은 항상 1이다.
export function elementDamageMult(
  _attacker: V2Element,
  _defender: V2Element,
  _advPct: number = V2_ELEMENT_ADV_PCT,
  _disPct: number = V2_ELEMENT_DIS_PCT,
): number {
  return 1;
}

// 옛 "light"/"dark" 저장값은 더 이상 유효 속성 아님 → neutral 로 graceful 폴백
// (test-adventure 리셋 허용 — 마이그 코드 불필요).
export function parseV2Element(raw: unknown): V2Element {
  return typeof raw === "string" &&
    (V2_ELEMENTS as readonly string[]).includes(raw)
    ? (raw as V2Element)
    : "neutral";
}
