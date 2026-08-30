// v2 비용 전직(commitment) — 직업 변경 비용/쿨다운.
// 클라(프리뷰)·서버(권위) 공용 pure 모듈.

import { V2_CLASS_DEFS, type V2Class } from "@/adventure/data/v2/classes";

// 변경 골드 다이얼.
// 2026-06-03 사용자 결정 — 자유로운 전직 우선. 직업군 변경 골드 무료(0) + 쿨다운 0.
// 남는 억제책 = 레벨1 리셋(전직 prestige) — 갈아탈 때마다 레벨 초기화라 남용 자체가 손해.
export const CLASS_CHANGE_GOLD_PER_LEVEL = 0;
// 변경 후 쿨다운 — 0(제거). 자유 전직. (레벨1 리셋이 남용을 막는 commitment.)
export const RESPEC_COOLDOWN_MS = 0;
// 직업군 변경 여부 — none 에서의 첫 선택은 무료. 같은 직업군 내(차수 이동)는 변경 아님
// (검사→견습 검사 같은 군 = 무변경). respec 은 직업군 단위 변경만 비용 대상.
export function isClassChange(cur: V2Class, next: V2Class): boolean {
  if (cur === "none") return false;
  return V2_CLASS_DEFS[cur].group !== V2_CLASS_DEFS[next].group;
}
// 이번 전직의 골드 비용. level ≥ 1 클램프.
export function respecGoldCost(
  curClass: V2Class,
  nextClass: V2Class,
  level: number,
): number {
  if (curClass === "none") return 0;
  const lv = Math.max(1, Math.floor(level));
  return isClassChange(curClass, nextClass)
    ? lv * CLASS_CHANGE_GOLD_PER_LEVEL
    : 0;
}

// 이번 전직이 비용/쿨다운 대상인지.
export function isPaidRespec(
  curClass: V2Class,
  nextClass: V2Class,
): boolean {
  if (curClass === "none") return false;
  return isClassChange(curClass, nextClass);
}
