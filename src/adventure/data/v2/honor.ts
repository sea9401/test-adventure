// 명예(honor) — 정착지 전쟁 개인 화폐. 설계: docs/v2-settlement-warfare-plan.md §2.5.
//   획득: 수비 전투 승리 / 길드 골드 입금. 소비: 길드 명예상점.
//   character.v2 세이브의 `honor` 키(number, 별도 DB 컬럼 없음). 순수 파서.

// 세이브 raw 값 → 명예(0 이상 정수). 미설정/손상 = 0.
export function parseHonor(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) return 0;
  return Math.floor(raw);
}
