// 거점 수비 전투력 — 점령 게이트 (2026-06-08, 2026-06-21 티어 정적값 전환).
//
// 거점의 수비 전투력은 거점 tier 로 정해진다(상위 tier = 더 높은 점령 난이도). 점령 라우트가
// 플레이어 합성 전투력(derivePowerScore — 캐릭터 화면 "전투력"·던전 권장파워와 동일 단위)과
// 비교해, 못 미치면 점령 시도를 막는다(A안: 게이트 통과 후 기존 NPC/PvP 전투 진행).
//
// (옛 "가장 가까운 왕국 중심까지의 거리에 비례" 모델은 v2 지도 재설계로 폐기 — 좌표가 규칙을
//  정하지 않게. docs/v2-map-redesign.md PR-2. tier 만으로 결정하므로 거점 위치/왕국과 무관.)
//
// 0 을 반환하면 게이트 없음(= 기존 난이도 유지):
//   - 절대 중립 거점(점령 불가)
//   - 중앙 분쟁지대 — 가운데 격전지. 기존 산적 수준(tier 1~2 챔피언) 유지.

import type { Outpost, OutpostTier } from "./types";

// 수비 전투력 다이얼 (derivePowerScore 단위). tier 별 정적값.
export const OUTPOST_DEFENSE_CENTER = 5000; // 최상위 tier(4)
export const OUTPOST_DEFENSE_EDGE = 1500; // 최하위 tier(1)
export const OUTPOST_DEFENSE_BY_TIER: Record<OutpostTier, number> = {
  1: OUTPOST_DEFENSE_EDGE, // 1500
  2: 2500,
  3: 3500,
  4: OUTPOST_DEFENSE_CENTER, // 5000
};

// 중앙 분쟁지대 — ContinentMap 의 CONFLICT_CENTER/RADIUS 와 같은 값이어야 한다
// (지도에서 무소속 분쟁지대로 표시되는 그 땅들과 동일 집합 = 수비 게이트 면제).
const CONFLICT_CENTER = { x: 5000, y: 2800 };
const CONFLICT_RADIUS = 800;

function isInConflictZone(o: Outpost): boolean {
  const dx = o.position.x - CONFLICT_CENTER.x;
  const dy = o.position.y - CONFLICT_CENTER.y;
  return dx * dx + dy * dy <= CONFLICT_RADIUS * CONFLICT_RADIUS;
}

// 거점 수비 전투력. 0 = 게이트 없음(중립·분쟁지대 — 기존 난이도 유지).
export function outpostDefensePower(o: Outpost): number {
  if (o.neutral) return 0;
  if (isInConflictZone(o)) return 0;
  return OUTPOST_DEFENSE_BY_TIER[o.tier];
}
