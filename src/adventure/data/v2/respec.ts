// v2 비용 전직(commitment) — 직업·속성 변경 비용/쿨다운 (PR-6).
// 설계: docs/v2-combat-redesign.md §5. 첫 선택(none/neutral 에서)은 무료, 변경만 비용.
// 클라(프리뷰)·서버(권위) 공용 pure 모듈.

import type { V2Class } from "@/adventure/data/v2/classes";
import type { V2Element } from "@/adventure/data/v2/elements";

// 변경 골드 = 레벨 × 계수 (고레벨일수록 투자 큼 → respec 비쌈). sim/체감 다이얼.
export const CLASS_CHANGE_GOLD_PER_LEVEL = 500;
export const ELEMENT_CHANGE_GOLD_PER_LEVEL = 200;
// 변경 후 쿨다운 — 콘텐츠마다 가볍게 갈아타 최적 수렴하는 걸 억제. 24h.
export const RESPEC_COOLDOWN_MS = 24 * 60 * 60 * 1000;

// 변경 여부 — none/neutral 에서의 첫 선택은 "변경"이 아님(무료 커밋).
export function isClassChange(cur: V2Class, next: V2Class): boolean {
  return next !== cur && cur !== "none";
}
export function isElementChange(cur: V2Element, next: V2Element): boolean {
  return next !== cur && cur !== "neutral";
}

// 이번 전직의 골드 비용 — 변경된 축만 합산. level ≥ 1 클램프.
export function respecGoldCost(
  curClass: V2Class,
  nextClass: V2Class,
  curElement: V2Element,
  nextElement: V2Element,
  level: number,
): number {
  const lv = Math.max(1, Math.floor(level));
  let cost = 0;
  if (isClassChange(curClass, nextClass)) {
    cost += lv * CLASS_CHANGE_GOLD_PER_LEVEL;
  }
  if (isElementChange(curElement, nextElement)) {
    cost += lv * ELEMENT_CHANGE_GOLD_PER_LEVEL;
  }
  return cost;
}

// 이번 전직이 비용/쿨다운 대상인지 (변경된 축이 하나라도 있는지).
export function isPaidRespec(
  curClass: V2Class,
  nextClass: V2Class,
  curElement: V2Element,
  nextElement: V2Element,
): boolean {
  return (
    isClassChange(curClass, nextClass) ||
    isElementChange(curElement, nextElement)
  );
}
