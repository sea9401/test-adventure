import { describe, it, expect } from "vitest";
import { OUTPOSTS } from "./outposts";
import {
  OUTPOST_EDGES,
  getOutpostNeighbors,
  areOutpostsAdjacent,
  shortestOutpostPath,
} from "./outpostGraph";

describe("v2 거점 인접 그래프 (Gabriel)", () => {
  const ids = new Set(OUTPOSTS.map((o) => o.id));

  it("모든 edge 의 양 끝이 실제 거점 id 이고 자기루프 없음", () => {
    for (const { a, b } of OUTPOST_EDGES) {
      expect(ids.has(a), a).toBe(true);
      expect(ids.has(b), b).toBe(true);
      expect(a).not.toBe(b);
    }
  });

  it("중복 edge 없음", () => {
    const keys = OUTPOST_EDGES.map(({ a, b }) =>
      a < b ? `${a}|${b}` : `${b}|${a}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("인접이 대칭", () => {
    for (const { a, b } of OUTPOST_EDGES) {
      expect(areOutpostsAdjacent(a, b)).toBe(true);
      expect(areOutpostsAdjacent(b, a)).toBe(true);
    }
  });

  it("모든 거점이 최소 1개 이웃 (고립 거점 없음)", () => {
    for (const o of OUTPOSTS) {
      expect(getOutpostNeighbors(o.id).length, o.name).toBeGreaterThan(0);
    }
  });

  it("전체가 하나로 연결 (BFS 로 전부 도달)", () => {
    const start = OUTPOSTS[0].id;
    const seen = new Set<string>([start]);
    const queue: string[] = [start];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const nb of getOutpostNeighbors(cur)) {
        if (!seen.has(nb)) {
          seen.add(nb);
          queue.push(nb);
        }
      }
    }
    expect(seen.size).toBe(OUTPOSTS.length);
  });

  it("좌표가 완전히 겹친 거점끼리는 서로 인접", () => {
    const byPos = new Map<string, string[]>();
    for (const o of OUTPOSTS) {
      const k = `${o.position.x},${o.position.y}`;
      (byPos.get(k) ?? byPos.set(k, []).get(k)!).push(o.id);
    }
    for (const ids of byPos.values()) {
      for (let i = 0; i < ids.length; i += 1) {
        for (let j = i + 1; j < ids.length; j += 1) {
          expect(
            areOutpostsAdjacent(ids[i], ids[j]),
            `${ids[i]} <-> ${ids[j]}`,
          ).toBe(true);
        }
      }
    }
  });

  it("적당히 솎였다 — 신장 트리 이상, 빽빽한 거미줄 미만", () => {
    // 최소 신장 트리(N-1) 이상이어야 연결되고, 평균 차수 4 미만이어야 "거미줄" 이 아니다.
    expect(OUTPOST_EDGES.length).toBeGreaterThanOrEqual(OUTPOSTS.length - 1);
    expect(OUTPOST_EDGES.length).toBeLessThan(OUTPOSTS.length * 2);
  });

  it("없는 거점 id 는 이웃 없음 / 인접 아님", () => {
    expect(getOutpostNeighbors("does_not_exist")).toEqual([]);
    expect(areOutpostsAdjacent("does_not_exist", OUTPOSTS[0].id)).toBe(false);
  });

  describe("shortestOutpostPath (다중 홉 경로)", () => {
    it("같은 거점이면 자기 자신만", () => {
      const id = OUTPOSTS[0].id;
      expect(shortestOutpostPath(id, id)).toEqual([id]);
    });

    it("없는 거점이면 null", () => {
      expect(shortestOutpostPath("nope", OUTPOSTS[0].id)).toBeNull();
      expect(shortestOutpostPath(OUTPOSTS[0].id, "nope")).toBeNull();
    });

    it("연결 그래프라 임의의 두 거점 사이에 경로가 있고, 각 단계가 실제 인접", () => {
      const a = OUTPOSTS[0].id;
      // 좌표상 먼 거점(마지막) 까지도 경로가 나와야 한다.
      const b = OUTPOSTS[OUTPOSTS.length - 1].id;
      const path = shortestOutpostPath(a, b);
      expect(path).not.toBeNull();
      const p = path!;
      expect(p[0]).toBe(a);
      expect(p[p.length - 1]).toBe(b);
      // 경로의 인접 쌍이 모두 실제 엣지이고, 같은 거점을 두 번 거치지 않는다.
      expect(new Set(p).size).toBe(p.length);
      for (let i = 1; i < p.length; i += 1) {
        expect(areOutpostsAdjacent(p[i - 1], p[i]), `${p[i - 1]}→${p[i]}`).toBe(
          true,
        );
      }
    });

    it("인접한 두 거점은 2개짜리 경로(1홉)", () => {
      const { a, b } = OUTPOST_EDGES[0];
      expect(shortestOutpostPath(a, b)).toEqual([a, b]);
    });
  });
});
