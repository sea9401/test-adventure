// v2 전쟁 시즌 점수 — 순수 상수 + 헬퍼. (docs/v2-war-redesign-plan.md PR-2)
//
// 점수축 = "처음 빼앗았다"(capture)와 "성벽을 깎았다"(siege_win)에 가중. 유지시간 점수는
// 금지한다 — 자동 단판 환경에서 최강자가 가만히 지키기만 해도 점수가 쌓이면 독점으로 굳는다.
//
// 독점 방지: 같은 길드가 같은 거점을 같은 시즌에 반복 점령해 점수를 무한 증식하지 못하게
// capture 점수에 감쇠를 둔다(1회 100% → 2회 40% → 3회+ 0%). siege_win 은 성벽 한 바퀴(≈5승)
// 마다 capture 로 귀결돼 소유권이 넘어가므로(자기 거점은 못 침) 자연히 자기 제한된다.

export type WarScoreEventType = "capture" | "siege_win" | "eject_win";

export const WAR_POINTS_CAPTURE = 100; // 다이얼
export const WAR_POINTS_SIEGE_WIN = 12; // 다이얼
export const WAR_POINTS_EJECT_WIN = 6; // 다이얼 (PR-3 토벌 점수)

// 거점 tier 가중 — 중앙 요새일수록 가치 ↑. (다이얼)
export const WAR_TIER_FACTOR: Record<number, number> = {
  1: 0.8,
  2: 1.0,
  3: 1.2,
  4: 1.5,
};

export function tierFactor(tier: number): number {
  return WAR_TIER_FACTOR[tier] ?? 1.0;
}

// 같은 길드·같은 거점·같은 시즌 capture 감쇠 — 재점령 파밍 무력화.
// priorCapturesThisSeason = 이번 시즌 이 길드가 이 거점을 이미 함락한 횟수.
export function captureDecayMultiplier(priorCapturesThisSeason: number): number {
  if (priorCapturesThisSeason <= 0) return 1;
  if (priorCapturesThisSeason === 1) return 0.4;
  return 0;
}

// 함락 점수(tier·감쇠 반영).
export function capturePoints(
  tier: number,
  priorCapturesThisSeason: number,
): number {
  return Math.round(
    WAR_POINTS_CAPTURE *
      tierFactor(tier) *
      captureDecayMultiplier(priorCapturesThisSeason),
  );
}

// 성벽 타격(함락 못 한 공성 진행) 점수 — tier 반영, 감쇠 없음(소유권 사이클이 자연 제한).
export function siegeWinPoints(tier: number): number {
  return Math.round(WAR_POINTS_SIEGE_WIN * tierFactor(tier));
}
