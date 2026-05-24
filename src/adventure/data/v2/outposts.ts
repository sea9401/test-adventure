// v2 거점 (Outpost) 정적 데이터 placeholder.
//
// 종류: mine(광산) / tower(마탑) / fort(요새) / village(마을)
// 등급: 1 마을 < 2 거점 < 3 도시 < 4 왕국
// 좌표: 대륙 좌표 공간. 큰 맵 느낌을 내기 위해 0~10000 × 0~6000 정도의 공간에 분산 예정.
//
// 이번 commit 은 골격 + 절대 중립 거점 한두 개 sketch. 실제 거점 배치는 후속 PR.

import type { Outpost } from "./types";

export const OUTPOSTS: Outpost[] = [
  // === 절대 중립 거점 ===
  // 모든 거점이 길드 점령된 상황에서도 사냥이 막히지 않게 sanity 보장.
  // 대륙 곳곳에 몇 군데 분산 배치 예정. NPC 영구 운영.
  {
    id: "neutral_haven_central",
    name: "중앙 자유 도시",
    type: "village",
    tier: 3,
    position: { x: 5000, y: 3000 }, // 대륙 중심
    neutral: true,
    description: "어느 세력에도 속하지 않는 자유 도시. 모든 모험가에게 열려 있다.",
  },
  // TODO: 절대 중립 거점 2~3 곳 더 배치 (대륙 동/서/북/남 등)

  // === 일반 거점 (점령 가능) ===
  // 종류 × 등급 매트릭스로 다양화. 실제 데이터는 다음 PR 에서 채움.
  // 큰 맵 느낌 위해 N(아마 60~100) 개 정도 흩어 배치 예정.
  // TODO: 마을(tier 1) 다수
  // TODO: 거점(tier 2) — 광산·마탑·요새 종류별
  // TODO: 도시(tier 3) — 더 큰 효과
  // TODO: 왕국(tier 4) — 종류별 최상위
];
