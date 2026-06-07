import { describe, it, expect } from "vitest";
import { OUTPOSTS } from "./outposts";
import {
  outpostDefensePower,
  OUTPOST_DEFENSE_CENTER,
  OUTPOST_DEFENSE_EDGE,
} from "./outpostDefense";

const byName = (n: string) => OUTPOSTS.find((o) => o.name === n)!;

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
    expect(outpostDefensePower(byName("중앙 요새"))).toBe(0);
    expect(outpostDefensePower(byName("평원 광장 거점"))).toBe(0);
  });

  it("왕국 소속 최외곽 땅은 EDGE(1500) 로 수렴", () => {
    expect(outpostDefensePower(byName("풀밭 마을"))).toBe(OUTPOST_DEFENSE_EDGE);
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
