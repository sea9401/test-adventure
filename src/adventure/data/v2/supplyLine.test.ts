import { describe, it, expect } from "vitest";
import { OUTPOSTS } from "./outposts";
import { OUTPOST_EDGES, getOutpostNeighbors } from "./outpostGraph";
import { canClaimOutpost } from "./supplyLine";

describe("보급선 점령 (canClaimOutpost)", () => {
  const neutralIds = OUTPOSTS.filter((o) => o.neutral).map((o) => o.id);

  it("중립 자유도시에 인접하면 소유 없이도 점령 가능(첫 발판)", () => {
    const neutral = neutralIds[0];
    const neighbor = getOutpostNeighbors(neutral)[0];
    expect(neighbor).toBeTruthy();
    expect(canClaimOutpost(neighbor, [])).toBe(true);
  });

  it("길드 소유 거점에 인접하면 점령 가능", () => {
    const { a, b } = OUTPOST_EDGES[0];
    expect(canClaimOutpost(b, [a])).toBe(true);
    expect(canClaimOutpost(a, [b])).toBe(true);
  });

  it("소유도 중립도 인접하지 않으면 거부", () => {
    // 이웃에 중립이 하나도 없는 거점을 골라 소유 없이 시도 → 발판 없음.
    const target = OUTPOSTS.find((o) => {
      const nbs = getOutpostNeighbors(o.id);
      return nbs.length > 0 && nbs.every((n) => !neutralIds.includes(n));
    });
    expect(target).toBeTruthy();
    expect(canClaimOutpost(target!.id, [])).toBe(false);
  });

  it("소유 목록은 Set/배열 모두 허용", () => {
    const { a, b } = OUTPOST_EDGES[0];
    expect(canClaimOutpost(b, new Set([a]))).toBe(true);
  });
});
