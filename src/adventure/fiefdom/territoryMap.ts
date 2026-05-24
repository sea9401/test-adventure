// 별자리 영지 맵 — Phase 2: 별빛 권역 안의 영지 오버뷰.
// 플레이어 영지 1개 + AI 영지 5개 고정 배치. 인접 그래프로 별자리선 그리고 공격 가능 범위 제한.
// SVG viewBox 는 1000×600 — FiefdomView 안에서 너비 100% / 높이 비율 유지.

export type TerritoryId =
  | "player"
  | "ai-1"
  | "ai-2"
  | "ai-3"
  | "ai-4"
  | "ai-5";

export type Territory = {
  id: TerritoryId;
  name: string;
  x: number;
  y: number;
  level: number;
  /** 양방향 인접 그래프 — 별자리선 표시 + 공격 가능 범위. */
  neighbors: TerritoryId[];
  owner: "player" | "ai";
};

export const TERRITORY_MAP_W = 1000;
export const TERRITORY_MAP_H = 600;

export const TERRITORIES: Territory[] = [
  {
    id: "player",
    name: "내 영지",
    x: 500,
    y: 320,
    level: 0,
    neighbors: ["ai-1", "ai-2", "ai-3"],
    owner: "player",
  },
  {
    id: "ai-1",
    name: "은빛 야영지",
    x: 220,
    y: 200,
    level: 1,
    neighbors: ["player", "ai-2"],
    owner: "ai",
  },
  {
    id: "ai-2",
    name: "안개 둔덕",
    x: 340,
    y: 470,
    level: 2,
    neighbors: ["player", "ai-1", "ai-3"],
    owner: "ai",
  },
  {
    id: "ai-3",
    name: "암석 진",
    x: 720,
    y: 400,
    level: 3,
    neighbors: ["player", "ai-2", "ai-4"],
    owner: "ai",
  },
  {
    id: "ai-4",
    name: "검은 별 요새",
    x: 850,
    y: 220,
    level: 4,
    neighbors: ["ai-3", "ai-5"],
    owner: "ai",
  },
  {
    id: "ai-5",
    name: "여명의 탑",
    x: 620,
    y: 110,
    level: 5,
    neighbors: ["ai-4"],
    owner: "ai",
  },
];

/** 인접 그래프를 무방향 엣지 리스트로 펼침(중복 제거). 별자리선 렌더용. */
export function listAdjacencyEdges(): Array<{ a: TerritoryId; b: TerritoryId }> {
  const seen = new Set<string>();
  const edges: Array<{ a: TerritoryId; b: TerritoryId }> = [];
  for (const t of TERRITORIES) {
    for (const n of t.neighbors) {
      const key = [t.id, n].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ a: t.id, b: n });
    }
  }
  return edges;
}

export function getTerritory(id: TerritoryId): Territory {
  const t = TERRITORIES.find((x) => x.id === id);
  if (!t) throw new Error(`Unknown territory: ${id}`);
  return t;
}

export function isAdjacent(a: TerritoryId, b: TerritoryId): boolean {
  return getTerritory(a).neighbors.includes(b);
}
