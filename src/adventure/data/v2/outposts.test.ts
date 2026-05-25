import { describe, it, expect } from "vitest";
import { OUTPOSTS, MAP_BOUNDS } from "./outposts";

describe("v2 outposts 데이터", () => {
  it("id 가 중복 없음", () => {
    const ids = OUTPOSTS.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("이름이 중복 없음", () => {
    const names = OUTPOSTS.map((o) => o.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("모든 좌표가 MAP_BOUNDS 안", () => {
    for (const o of OUTPOSTS) {
      expect(o.position.x).toBeGreaterThanOrEqual(0);
      expect(o.position.x).toBeLessThanOrEqual(MAP_BOUNDS.width);
      expect(o.position.y).toBeGreaterThanOrEqual(0);
      expect(o.position.y).toBeLessThanOrEqual(MAP_BOUNDS.height);
    }
  });

  // 대륙 일러스트는 가장자리에 바다/ocean 여백이 있어 안전 interior 만 land.
  // 마커 반지름 (최대 ~110) 도 고려해 inset 둠. 정확한 land 외곽선은 아니지만
  // 명백히 바다 위 마커는 잡힘.
  it("모든 좌표가 안전 interior (육지) 안", () => {
    const SAFE = { xMin: 1000, xMax: 9100, yMin: 450, yMax: 5300 };
    for (const o of OUTPOSTS) {
      expect(o.position.x, `${o.name} x`).toBeGreaterThanOrEqual(SAFE.xMin);
      expect(o.position.x, `${o.name} x`).toBeLessThanOrEqual(SAFE.xMax);
      expect(o.position.y, `${o.name} y`).toBeGreaterThanOrEqual(SAFE.yMin);
      expect(o.position.y, `${o.name} y`).toBeLessThanOrEqual(SAFE.yMax);
    }
  });

  it("tier 가 1~4", () => {
    for (const o of OUTPOSTS) {
      expect([1, 2, 3, 4]).toContain(o.tier);
    }
  });

  it("절대 중립은 4 곳", () => {
    expect(OUTPOSTS.filter((o) => o.neutral).length).toBe(4);
  });

  it("왕국(tier 4) 5 곳", () => {
    expect(OUTPOSTS.filter((o) => o.tier === 4).length).toBe(5);
  });

  it("절대 중립과 일반 거점이 겹치지 않음", () => {
    for (const o of OUTPOSTS) {
      if (o.neutral) {
        expect(o.tier).toBeLessThan(4); // 왕국은 중립 X
      }
    }
  });
});
