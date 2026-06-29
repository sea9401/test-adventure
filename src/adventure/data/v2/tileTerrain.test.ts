import { describe, it, expect } from "vitest";
import {
  TILE_BOARD_SIZE,
  TILE_BOARD_CENTER,
  TILE_TERRAIN,
  TILE_TERRAIN_LABEL,
  TILE_OUTPOST_AT,
  HOTSPRING_BENEFIT_COORDS,
  tileFeatureAt,
  isTileSettleable,
  isStrongholdTile,
  isTradeRouteTile,
  isLakeAdjacentTile,
  tileKey,
  tileNeighbors4,
  areTilesAdjacent4,
  type TileFeatureKind,
} from "./tileConfig";

// 전략 지형 레이어(P1) — 산맥/협곡/호수 손배치 데이터의 순수 불변식.
//   통행/정착 게이트만 검증(수치 효과는 후속 PR). 핵심 = 배치가 보드를 영구 고립시키지 않음.

const parseKey = (k: string): [number, number] => {
  const [c, r] = k.split(",").map(Number);
  return [c, r];
};

describe("TILE_TERRAIN — 배치 데이터", () => {
  it("모든 좌표가 보드 범위 안(0..8)", () => {
    for (const k of Object.keys(TILE_TERRAIN)) {
      const [c, r] = parseKey(k);
      expect(c).toBeGreaterThanOrEqual(0);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThan(TILE_BOARD_SIZE);
      expect(r).toBeLessThan(TILE_BOARD_SIZE);
    }
  });

  it("산맥·호수·온천은 정착 불가(false), 협곡·요새터·교역로는 정착 가능(true)", () => {
    for (const f of Object.values(TILE_TERRAIN)) {
      if (f.kind === "mountain" || f.kind === "lake" || f.kind === "hotspring") {
        expect(f.settleable).toBe(false);
      }
      if (
        f.kind === "canyon" ||
        f.kind === "stronghold" ||
        f.kind === "trade_route"
      ) {
        expect(f.settleable).toBe(true);
      }
    }
  });

  it("배치 종류는 산맥/협곡/호수/온천/요새터/교역로/던전", () => {
    const kinds = new Set(Object.values(TILE_TERRAIN).map((f) => f.kind));
    for (const kind of kinds) {
      expect([
        "mountain",
        "canyon",
        "lake",
        "hotspring",
        "stronghold",
        "trade_route",
        "dungeon",
      ]).toContain(kind);
    }
  });

  it("지형 칸은 거점 칸과 겹치지 않는다", () => {
    for (const k of Object.keys(TILE_TERRAIN)) {
      expect(TILE_OUTPOST_AT.has(k)).toBe(false);
    }
  });
});

describe("tileFeatureAt / isTileSettleable — 헬퍼", () => {
  it("배치 칸은 피처, 빈 칸은 null", () => {
    expect(tileFeatureAt(2, 1)?.kind).toBe("mountain");
    expect(tileFeatureAt(2, 4)?.kind).toBe("canyon");
    expect(tileFeatureAt(6, 6)?.kind).toBe("lake");
    expect(tileFeatureAt(1, 1)?.kind).toBe("hotspring");
    expect(tileFeatureAt(3, 2)?.kind).toBe("dungeon");
    expect(tileFeatureAt(0, 0)).toBeNull();
  });

  it("빈 칸·협곡·요새터·교역로는 settleable, 산맥·호수·온천·던전은 not", () => {
    expect(isTileSettleable(0, 0)).toBe(true); // 빈 땅
    expect(isTileSettleable(2, 4)).toBe(true); // 협곡(길목)
    expect(isTileSettleable(8, 4)).toBe(true); // 요새터(ON-tile)
    expect(isTileSettleable(1, 6)).toBe(true); // 교역로(ON-tile)
    expect(isTileSettleable(2, 1)).toBe(false); // 산맥
    expect(isTileSettleable(6, 6)).toBe(false); // 호수
    expect(isTileSettleable(1, 1)).toBe(false); // 온천(아우라 타일)
    expect(isTileSettleable(3, 2)).toBe(false); // 던전 입구(진입형 콘텐츠)
  });
});

describe("전략 지형 술어 — 요새터/교역로/호수 인접 (P3)", () => {
  it("isStrongholdTile — (8,4)(7,7)만 true", () => {
    expect(isStrongholdTile(8, 4)).toBe(true);
    expect(isStrongholdTile(7, 7)).toBe(true);
    expect(isStrongholdTile(1, 6)).toBe(false); // 교역로
    expect(isStrongholdTile(0, 0)).toBe(false); // 빈 땅
  });

  it("isTradeRouteTile — (1,6)만 true", () => {
    expect(isTradeRouteTile(1, 6)).toBe(true);
    expect(isTradeRouteTile(8, 4)).toBe(false); // 요새터
    expect(isTradeRouteTile(0, 0)).toBe(false);
  });

  it("isLakeAdjacentTile — 호수(6,6)(7,6) 4-인접만 true", () => {
    // (7,7)은 호수(7,6) 인접 = 의도된 수변 요새 시너지.
    expect(isLakeAdjacentTile(7, 7)).toBe(true); // (7,6) 호수에 인접
    expect(isLakeAdjacentTile(5, 6)).toBe(true); // (6,6) 호수에 인접
    expect(isLakeAdjacentTile(6, 5)).toBe(true); // (6,6) 호수에 인접
    expect(isLakeAdjacentTile(8, 4)).toBe(false); // 요새터·호수 비인접
    expect(isLakeAdjacentTile(0, 0)).toBe(false);
    expect(isLakeAdjacentTile(8, 8)).toBe(false); // 먼 구석·호수 비인접
  });
});

describe("TILE_TERRAIN_LABEL — 라벨", () => {
  it("모든 종류에 한글 라벨", () => {
    const kinds: TileFeatureKind[] = [
      "mountain",
      "canyon",
      "lake",
      "hotspring",
      "stronghold",
      "trade_route",
      "dungeon",
    ];
    for (const kind of kinds) {
      expect(TILE_TERRAIN_LABEL[kind]).toBeTruthy();
    }
  });
});

describe("배치 — 리베라(중앙) bootstrap 초크 회피", () => {
  it("리베라(4,4)와 그 4-인접 링은 지형이 없다", () => {
    const center: [number, number] = [TILE_BOARD_CENTER, TILE_BOARD_CENTER];
    expect(tileFeatureAt(center[0], center[1])).toBeNull();
    for (const n of tileNeighbors4(center[0], center[1])) {
      expect(areTilesAdjacent4(center[0], center[1], n.col, n.row)).toBe(true);
      expect(tileFeatureAt(n.col, n.row)).toBeNull();
    }
  });
});

describe("배치 — 산맥 벽은 협곡으로 뚫린다(길목)", () => {
  it("좌측 줄(col2)·우측 줄(col6) 각각 협곡 1칸 이상", () => {
    const canyonsInCol = (col: number) =>
      Object.entries(TILE_TERRAIN).filter(([k, f]) => {
        const [c] = parseKey(k);
        return c === col && f.kind === "canyon";
      }).length;
    expect(canyonsInCol(2)).toBeGreaterThanOrEqual(1);
    expect(canyonsInCol(6)).toBeGreaterThanOrEqual(1);
  });
});

describe("온천(hotspring) 수혜 zone — HOTSPRING_BENEFIT_COORDS (P2)", () => {
  it("수혜 zone = 온천(1,1) 인접 정착 가능 칸 {(1,0),(0,1),(1,2)} — 산맥(2,1) 제외", () => {
    const set = new Set(
      HOTSPRING_BENEFIT_COORDS.map((c) => tileKey(c.col, c.row)),
    );
    expect(set).toEqual(new Set(["1,0", "0,1", "1,2"]));
  });

  it("모든 수혜 칸은 정착 가능(소유 가능)해야 길드 소유 조회가 의미 있다", () => {
    for (const c of HOTSPRING_BENEFIT_COORDS) {
      expect(isTileSettleable(c.col, c.row)).toBe(true);
    }
  });

  it("모든 수혜 칸은 어떤 온천에 4-인접", () => {
    const springs = Object.entries(TILE_TERRAIN)
      .filter(([, f]) => f.kind === "hotspring")
      .map(([k]) => parseKey(k));
    for (const c of HOTSPRING_BENEFIT_COORDS) {
      const adjacent = springs.some(([sc, sr]) =>
        areTilesAdjacent4(sc, sr, c.col, c.row),
      );
      expect(adjacent).toBe(true);
    }
  });
});

describe("배치 — 통행 가능 칸은 단일 연결 성분(영구 고립 없음)", () => {
  // 산맥·호수(settleable=false)를 벽으로 두되, 던전 입구는 진입형 콘텐츠라 통행 가능 예외로
  // 두고 4-인접 BFS 로 잇는다.
  //   리베라(4,4)에서 모든 통행 가능 칸에 도달 가능해야 한다(어떤 구역도 영원히 갇히지 않음).
  it("리베라에서 모든 통행 가능 칸 도달 가능", () => {
    const passable = (c: number, r: number) =>
      isTileSettleable(c, r) || tileFeatureAt(c, r)?.kind === "dungeon";
    const start: [number, number] = [TILE_BOARD_CENTER, TILE_BOARD_CENTER];
    expect(passable(start[0], start[1])).toBe(true);

    const seen = new Set<string>([tileKey(start[0], start[1])]);
    const stack: Array<[number, number]> = [start];
    while (stack.length) {
      const [c, r] = stack.pop()!;
      for (const n of tileNeighbors4(c, r)) {
        const k = tileKey(n.col, n.row);
        if (seen.has(k) || !passable(n.col, n.row)) continue;
        seen.add(k);
        stack.push([n.col, n.row]);
      }
    }

    // 보드의 모든 통행 가능 칸을 셈 → 도달한 수와 같아야(단일 성분).
    let totalPassable = 0;
    for (let c = 0; c < TILE_BOARD_SIZE; c++) {
      for (let r = 0; r < TILE_BOARD_SIZE; r++) {
        if (passable(c, r)) totalPassable++;
      }
    }
    expect(seen.size).toBe(totalPassable);
  });
});
