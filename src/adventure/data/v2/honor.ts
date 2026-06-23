// 명예(honor) — 정착지 전쟁 개인 화폐. 설계: docs/v2-settlement-warfare-plan.md §2.5.
//   획득: 수비 전투 승리 / 길드 골드 입금. 소비: 길드 명성상점.
//   character.v2 세이브의 `honor` 키(number, 별도 DB 컬럼 없음). 순수 파서.
//   UI 표기는 "명성"(honor/fame 표기 통일) — 코드 식별자는 honor 유지.

// 세이브 raw 값 → 사용 가능 명성(보유 잔액, 0 이상 정수). 미설정/손상 = 0.
//   상점 소비 시 차감되는 spendable 잔액.
export function parseHonor(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) return 0;
  return Math.floor(raw);
}

// 누적 명성(honorEarned) — 명성 획득 누계. 상점 소비와 무관(절대 감소 없음). 길드 명성 적립의 원천.
//   character.v2 세이브의 `honorEarned` 키. 미설정(레거시) = 현재 보유 명성(spendable)으로 폴백
//   → "누적 ≥ 보유" 불변 보장(이미 번 걸 쓴 것처럼 누적이 보유보다 작게 보이는 일 방지).
//   첫 획득 후엔 항상 stored ≥ spendable 이라 max() 가 stored 를 택함(이중 계산 없음).
export function parseHonorEarned(rawEarned: unknown, spendable: number): number {
  const stored =
    typeof rawEarned === "number" &&
    Number.isFinite(rawEarned) &&
    rawEarned >= 0
      ? Math.floor(rawEarned)
      : 0;
  return Math.max(stored, Math.max(0, Math.floor(spendable)));
}
