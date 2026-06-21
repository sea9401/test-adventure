import { describe, it, expect } from "vitest";
import { OUTPOSTS } from "./outposts";
import {
  outpostDefensePower,
  OUTPOST_DEFENSE_CENTER,
  OUTPOST_DEFENSE_EDGE,
} from "./outpostDefense";

// id 기반 lookup — 표시 이름은 콘텐츠 리네이밍으로 바뀔 수 있다(2026-06 고유명사화).
const byId = (id: string) => OUTPOSTS.find((o) => o.id === id)!;

describe("outpostDefensePower", () => {
  it("왕국 중심(tier 4)은 최대 수비 전투력", () => {
    const kingdoms = OUTPOSTS.filter((o) => o.tier === 4);
    expect(kingdoms.length).toBe(5);
    for (const k of kingdoms) {
      expect(outpostDefensePower(k)).toBe(OUTPOST_DEFENSE_CENTER);
    }
  });

  it("절대 중립 거점은 0 (게이트 없음)", () => {
    for (const n of OUTPOSTS.filter((o) => o.neutral)) {
      expect(outpostDefensePower(n)).toBe(0);
    }
  });

  it("중앙 분쟁지대 거점은 0 (기존 산적 난이도 유지)", () => {
    expect(outpostDefensePower(byId("war_central_fort"))).toBe(0);
    expect(outpostDefensePower(byId("outpost_plain_square"))).toBe(0);
  });

  it("왕국 소속 땅의 수비 전투력은 EDGE(1500) 하한 이상", () => {
    // 게이트 있는(비0) 거점은 모두 EDGE 이상. (지도 축소 40→23, 2026-06-21로 EDGE_DIST=2500
    // 이상 떨어진 최외곽 거점이 컷돼 정확히 EDGE 로 수렴하는 거점은 없어졌다 — 하한 불변만 검증.
    // 왕국거리 기반 수비력은 후속 PR 에서 티어 정적값으로 대체 예정.)
    const gated = OUTPOSTS.filter((o) => !o.neutral)
      .map((o) => outpostDefensePower(o))
      .filter((v) => v > 0);
    expect(gated.length).toBeGreaterThan(0);
    expect(Math.min(...gated)).toBeGreaterThanOrEqual(OUTPOST_DEFENSE_EDGE);
  });

  it("모든 거점 수비 전투력은 0 또는 [EDGE, CENTER] 범위", () => {
    for (const o of OUTPOSTS) {
      const v = outpostDefensePower(o);
      expect(
        v === 0 || (v >= OUTPOST_DEFENSE_EDGE && v <= OUTPOST_DEFENSE_CENTER),
      ).toBe(true);
    }
  });
});
