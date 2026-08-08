// 회복약 최대 보충만으로도 약 1천만 G가 소비되는 현재 경제 규모를 반영한다.
// 일상적인 상점 소비는 제외하고, 그 두 배 이상의 단일 이동부터 운영 경보 후보로 본다.
export const LARGE_GOLD_MOVEMENT_MIN = 20_000_000;
export const LARGE_GOLD_MOVEMENT_LABEL = "2천만";

export function isLargeGoldMovement(goldDelta: number): boolean {
  return Math.abs(Math.trunc(goldDelta)) >= LARGE_GOLD_MOVEMENT_MIN;
}
