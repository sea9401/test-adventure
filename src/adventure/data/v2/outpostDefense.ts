// 거점 수비 전투력 — 점령 게이트 (2026-06-08).
//
// 왕국 소속 땅은 왕국 단위 수비라 점령 난이도가 매우 높다. 거점의 수비 전투력은
// 가장 가까운 왕국 중심까지의 거리에 비례해 선형으로 정해진다: 왕국 중심 = 5000,
// 외곽으로 갈수록 줄어 최외곽 = 1500. 점령 라우트가 플레이어 합성 전투력
// (derivePowerScore — 캐릭터 화면 "전투력"·던전 권장파워와 동일 단위)과 비교해,
// 못 미치면 점령 시도를 막는다(A안: 게이트 통과 후 기존 NPC/PvP 전투 진행).
//
// 0 을 반환하면 게이트 없음(= 기존 난이도 유지):
//   - 절대 중립 거점(점령 불가)
//   - 중앙 분쟁지대 — 어느 왕국 소속도 아닌 가운데 격전지. 기존 산적 수준(tier 1~2 챔피언) 유지.

import { OUTPOSTS } from "./outposts";
import type { Outpost } from "./types";

// 수비 전투력 다이얼 (derivePowerScore 단위).
export const OUTPOST_DEFENSE_CENTER = 5000; // 왕국 중심
export const OUTPOST_DEFENSE_EDGE = 1500; // 최외곽
// 이 거리(맵 좌표)에서 EDGE 에 도달하고, 그 너머는 EDGE 로 클램프.
export const OUTPOST_DEFENSE_EDGE_DIST = 2500;

// 중앙 분쟁지대 — ContinentMap 의 CONFLICT_CENTER/RADIUS 와 같은 값이어야 한다
// (지도에서 무소속 분쟁지대로 표시되는 그 땅들과 동일 집합 = 수비 게이트 면제).
const CONFLICT_CENTER = { x: 5000, y: 2800 };
const CONFLICT_RADIUS = 800;

// 왕국 중심 좌표 = tier 4 거점 위치. 이름이 바뀌어도 위치로 파생되므로 안정적.
const KINGDOM_CENTERS = OUTPOSTS.filter((o) => o.tier === 4).map(
  (o) => o.position,
);

function nearestKingdomDist(o: Outpost): number {
  let best = Infinity;
  for (const c of KINGDOM_CENTERS) {
    const d = Math.hypot(o.position.x - c.x, o.position.y - c.y);
    if (d < best) best = d;
  }
  return best;
}

function isInConflictZone(o: Outpost): boolean {
  const dx = o.position.x - CONFLICT_CENTER.x;
  const dy = o.position.y - CONFLICT_CENTER.y;
  return dx * dx + dy * dy <= CONFLICT_RADIUS * CONFLICT_RADIUS;
}

// 거점 수비 전투력. 0 = 게이트 없음(중립·분쟁지대 — 기존 난이도 유지).
export function outpostDefensePower(o: Outpost): number {
  if (o.neutral) return 0;
  if (isInConflictZone(o)) return 0;
  const t = Math.min(1, nearestKingdomDist(o) / OUTPOST_DEFENSE_EDGE_DIST);
  return Math.round(
    OUTPOST_DEFENSE_CENTER + (OUTPOST_DEFENSE_EDGE - OUTPOST_DEFENSE_CENTER) * t,
  );
}
