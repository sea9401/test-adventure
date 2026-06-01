import { describe, it, expect } from "vitest";
import { OUTPOSTS } from "./outposts";
import {
  OUTPOST_EDGES,
  getOutpostNeighbors,
  areOutpostsAdjacent,
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

  it("없는 거점 id 는 이웃 없음 / 인접 아님", () => {
    expect(getOutpostNeighbors("does_not_exist")).toEqual([]);
    expect(areOutpostsAdjacent("does_not_exist", OUTPOSTS[0].id)).toBe(false);
  });
});
