// v2 속성 시스템 (전투 재설계 PR-5). 캐릭터·몬스터에 부착, 상성으로 데미지 ±%.
// 설계: docs/v2-combat-redesign.md §6.
//
// PR-5 — 옛 "5순환 + 빛/어둠 별도 대립쌍"(축 2개)을 **단일 먹이사슬(7-ring)** 으로 통합.
// 표시명은 **빛/어둠**(2026-06-13 사용자 결정 — 별빛/공허가 대중적이지 않음). 내부 id 는
// 로 재해석 — 도덕 이분법이 아니라 세계관 생태로 순환 안에 편입.
//
// 단일 순환 (각 원소가 다음을 카운터, 데미지 +; 역방향은 −):
//   물 → 불 → 바람 → 빛(starlight) → 어둠(void) → 대지 → 번개 → (물)  ← id 는 세이브 호환 유지
//     물>불    물이 불을 끈다
//     불>바람   불이 공기를 태워 번진다
//     바람>빛   운무·대기가 빛을 가린다
//     빛>어둠   빛이 어둠을 몰아낸다
//     어둠>대지  어둠이 대지의 토대를 좀먹는다
//     대지>번개  대지가 번개를 접지한다
//     번개>물   물이 전류를 퍼뜨려 증폭
//   무속성(neutral): 상성 없음 — 튜토리얼·잡몹·보스(카운터 농사 차단)·일관성 빌드용.

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

// 캐릭터가 고를 수 있는 속성 (무속성 포함 — "속성 없음" 정체성도 선택지).
export const V2_PLAYER_ELEMENTS: readonly V2Element[] = V2_ELEMENTS;

// 먹이사슬 단일 순환 — CYCLE[i] 가 CYCLE[i+1] 을 카운터. 여기서 ADVANTAGE 자동 생성.
export const V2_ELEMENT_CYCLE: readonly V2Element[] = [
  "water",
  "fire",
  "wind",
  "starlight",
  "void",
  "earth",
  "lightning",
];

// 상성 우위 쌍: [공격자, 피격자] — 공격자가 피격자를 카운터(데미지 +). 순환에서 파생.
const ADVANTAGE: ReadonlyArray<readonly [V2Element, V2Element]> =
  V2_ELEMENT_CYCLE.map(
    (a, i) => [a, V2_ELEMENT_CYCLE[(i + 1) % V2_ELEMENT_CYCLE.length]] as const,
  );

// 상성 배율 — 양방향 모델(2026-06-20): 유리 +딜 / 불리 −딜(받을 땐 강점이면 덜 맞고 약점이면 더 맞음).
//   PvE 유리 +25%, 불리 −15%. 무속성 항상 ×1.0. 날씨와 곱연산(직교). 다이얼=이 두 상수.
//   옛 "약점 찌르기"(불리 0·공격 전용)에서 양방향으로 전환. 적용점: 플레이어 공격(combatShared)·
//   몹 평타(engine.enemyPhase)·PvP 평타(engine.pvpPhase). ⚠️ 몹 스킬은 중립 유지 — 몹이 스킬+평타를
//   동시 발동하는 구조라 평타에만 적용해 이중을 막는다(engine.ts 몹 cast 0/0 주석 참조).
export const V2_ELEMENT_ADV_PCT = 25;
export const V2_ELEMENT_DIS_PCT = 15;
// PvP 는 별도 계수(낮게·양방향 대칭) — 속성이 장비/스탯 차이를 압도하지 않게. 기존 ±15 유지(메타 불변).
// arena route(평타)·engine-pvp(스킬, combatShared 경유)가 이 값을 elementDamageMult 에 명시 전달.
export const V2_ELEMENT_ADV_PCT_PVP = 15;
export const V2_ELEMENT_DIS_PCT_PVP = 15;

const ADV_SET = new Set(ADVANTAGE.map(([a, d]) => `${a}>${d}`));

// X 를 카운터하는 속성 — CYCLE[i] 가 CYCLE[i+1] 을 카운터하므로 X 의 카운터는 한 칸 앞.
// 사냥터 "추천 속성"(밴드 최빈 몹 속성을 찌르는 픽) 계산용. neutral 은 카운터 없음.
export function counterElementOf(e: V2Element): V2Element | null {
  const idx = V2_ELEMENT_CYCLE.indexOf(e);
  if (idx < 0) return null;
  return V2_ELEMENT_CYCLE[
    (idx - 1 + V2_ELEMENT_CYCLE.length) % V2_ELEMENT_CYCLE.length
  ];
}

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
// advPct/disPct 미지정 = PvE 기본(25/0). PvP 호출부(arena·engine-pvp)는 PvP 계수(15/15)를 명시 전달.
export function elementDamageMult(
  attacker: V2Element,
  defender: V2Element,
  advPct: number = V2_ELEMENT_ADV_PCT,
  disPct: number = V2_ELEMENT_DIS_PCT,
): number {
  switch (elementMatchup(attacker, defender)) {
    case "advantage":
      return 1 + advPct / 100;
    case "disadvantage":
      return 1 - disPct / 100;
    default:
      return 1;
  }
}

// 옛 "light"/"dark" 저장값은 더 이상 유효 속성 아님 → neutral 로 graceful 폴백
// (test-adventure 리셋 허용 — 마이그 코드 불필요).
export function parseV2Element(raw: unknown): V2Element {
  return typeof raw === "string" &&
    (V2_ELEMENTS as readonly string[]).includes(raw)
    ? (raw as V2Element)
    : "neutral";
}
