// v2 속성 시스템 (전투 재설계 PR-1). 캐릭터·몬스터에 부착, 상성으로 데미지 ±%.
// 설계: docs/v2-combat-redesign.md §6.
//   5속성 순환: 물>불>바람>대지>번개>물 (좌가 우를 카운터)
//   빛 ↔ 어둠: 상호 카운터 (서로에게 +)
//   무속성: 상성 없음 (중립)
// 슬라이스 단계라 캐릭·몬스터에만 부착 — 스킬/장비 속성은 PR-5 확장.

export const V2_ELEMENTS = [
  "neutral",
  "fire",
  "water",
  "lightning",
  "earth",
  "wind",
  "light",
  "dark",
] as const;

export type V2Element = (typeof V2_ELEMENTS)[number];

export const V2_ELEMENT_LABEL: Record<V2Element, string> = {
  neutral: "무속성",
  fire: "불",
  water: "물",
  lightning: "번개",
  earth: "대지",
  wind: "바람",
  light: "빛",
  dark: "어둠",
};

// 캐릭터가 고를 수 있는 속성 (무속성 포함 — "속성 없음" 정체성도 선택지).
export const V2_PLAYER_ELEMENTS: readonly V2Element[] = V2_ELEMENTS;

// 상성 우위 쌍: [공격자, 피격자] — 공격자가 피격자를 카운터(데미지 +).
const ADVANTAGE: ReadonlyArray<readonly [V2Element, V2Element]> = [
  ["water", "fire"],
  ["fire", "wind"],
  ["wind", "earth"],
  ["earth", "lightning"],
  ["lightning", "water"],
  // 빛/어둠 상호 — 서로에게 우위.
  ["light", "dark"],
  ["dark", "light"],
];

// 상성 배율 — 우위 +%, 열세 −% (양방향). 슬라이스 시작값, sim 캘리브 대상(§11).
export const V2_ELEMENT_ADV_PCT = 20;
export const V2_ELEMENT_DIS_PCT = 20;

const ADV_SET = new Set(ADVANTAGE.map(([a, d]) => `${a}>${d}`));

export type ElementMatchup = "advantage" | "disadvantage" | "neutral";

export function elementMatchup(
  attacker: V2Element,
  defender: V2Element,
): ElementMatchup {
  if (attacker === "neutral" || defender === "neutral") return "neutral";
  if (ADV_SET.has(`${attacker}>${defender}`)) return "advantage";
  if (ADV_SET.has(`${defender}>${attacker}`)) return "disadvantage";
  return "neutral";
}

// 공격자 속성이 피격자 속성을 상대로 줄 데미지 배율 (1 = 무영향).
export function elementDamageMult(
  attacker: V2Element,
  defender: V2Element,
): number {
  switch (elementMatchup(attacker, defender)) {
    case "advantage":
      return 1 + V2_ELEMENT_ADV_PCT / 100;
    case "disadvantage":
      return 1 - V2_ELEMENT_DIS_PCT / 100;
    default:
      return 1;
  }
}

export function parseV2Element(raw: unknown): V2Element {
  return typeof raw === "string" &&
    (V2_ELEMENTS as readonly string[]).includes(raw)
    ? (raw as V2Element)
    : "neutral";
}
