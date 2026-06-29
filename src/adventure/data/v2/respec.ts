// v2 비용 전직(commitment) — 직업·속성 변경 비용/쿨다운 (PR-6).
// 설계: docs/v2-combat-redesign.md §5. 첫 선택(none/neutral 에서)은 무료, 변경만 비용.
// 클라(프리뷰)·서버(권위) 공용 pure 모듈.

import { V2_CLASS_DEFS, type V2Class } from "@/adventure/data/v2/classes";
import type { V2Element } from "@/adventure/data/v2/elements";

// 변경 골드 = 레벨 × 계수. sim/체감 다이얼.
// 2026-06-03 사용자 결정 — 자유로운 전직 우선. 직업군 변경 골드 무료(0) + 쿨다운 0.
// 남는 억제책 = 레벨1 리셋(전직 prestige) — 갈아탈 때마다 레벨 초기화라 남용 자체가 손해.
// 속성 변경 골드(200/lv)는 그대로.
export const CLASS_CHANGE_GOLD_PER_LEVEL = 0;
export const ELEMENT_CHANGE_GOLD_PER_LEVEL = 200;
export const ELEMENT_CHANGE_COOLDOWN_MS = 24 * 60 * 60 * 1000;
// 변경 후 쿨다운 — 0(제거). 자유 전직. (레벨1 리셋이 남용을 막는 commitment.)
export const RESPEC_COOLDOWN_MS = 0;
// PR-7 — 2차 전직(advance) 골드 = 레벨 × 계수. respec 과 별개(쿨다운 없음 = 진척).
export const ADVANCE_GOLD_PER_LEVEL = 300;

export function advanceGoldCost(level: number): number {
  return Math.max(1, Math.floor(level)) * ADVANCE_GOLD_PER_LEVEL;
}

export function elementChangeGoldCost(level: number): number {
  return Math.max(1, Math.floor(level)) * ELEMENT_CHANGE_GOLD_PER_LEVEL;
}

// 직업군 변경 여부 — none 에서의 첫 선택은 무료. 같은 직업군 내(차수 이동)는 변경 아님
// (검사→견습 검사 같은 군 = 무변경). respec 은 직업군 단위 변경만 비용 대상.
export function isClassChange(cur: V2Class, next: V2Class): boolean {
  if (cur === "none") return false;
  return V2_CLASS_DEFS[cur].group !== V2_CLASS_DEFS[next].group;
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
  // 첫 선택(curClass none = 캐릭터 생성/온보딩 미완)은 무료 — element 가 어떤 값이든
  // (옛 부분 생성으로 element 만 박힌 오염 save 포함) 비용 0. 변경(respec)만 과금.
  if (curClass === "none") return 0;
  const lv = Math.max(1, Math.floor(level));
  let cost = 0;
  if (isClassChange(curClass, nextClass)) {
    cost += lv * CLASS_CHANGE_GOLD_PER_LEVEL;
  }
  if (isElementChange(curElement, nextElement)) {
    cost += elementChangeGoldCost(level);
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
  // 첫 선택(curClass none)은 무료 — class-element 라우트의 비용/쿨다운 분기를 건너뛴다.
  // (isClassChange 는 이미 none 을 무료 처리하지만 element 축은 별도라 여기서 일괄 차단.)
  if (curClass === "none") return false;
  return (
    isClassChange(curClass, nextClass) ||
    isElementChange(curElement, nextElement)
  );
}
