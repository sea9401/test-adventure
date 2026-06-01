import { describe, it, expect } from "vitest";
import {
  computeTreasureSeasonPayouts,
  treasureRankCoins,
} from "./treasurePayouts";

describe("treasureRankCoins", () => {
  it("순위 경계 1/2/3/4~10/11+/0", () => {
    expect(treasureRankCoins(1)).toBe(200);
    expect(treasureRankCoins(2)).toBe(130);
    expect(treasureRankCoins(3)).toBe(90);
    expect(treasureRankCoins(4)).toBe(40);
    expect(treasureRankCoins(10)).toBe(40);
    expect(treasureRankCoins(11)).toBe(0);
    expect(treasureRankCoins(0)).toBe(0);
  });
});

describe("computeTreasureSeasonPayouts", () => {
  it("발굴가치 내림차순 표준 경쟁 순위 → 코인", () => {
    const p = computeTreasureSeasonPayouts([
      { userId: "b", value: 50 },
      { userId: "a", value: 100 },
      { userId: "d", value: 10 },
      { userId: "c", value: 50 }, // b 와 동률 2위
    ]);
    expect(p.get("a")).toBe(200); // 1위
    expect(p.get("b")).toBe(130); // 2위
    expect(p.get("c")).toBe(130); // 2위 동률
    expect(p.get("d")).toBe(40); // 3위 건너뛰고 4위
  });

  it("0점/음수는 제외", () => {
    const p = computeTreasureSeasonPayouts([
      { userId: "a", value: 100 },
      { userId: "z", value: 0 },
      { userId: "n", value: -5 },
    ]);
    expect(p.get("a")).toBe(200);
    expect(p.has("z")).toBe(false);
    expect(p.has("n")).toBe(false);
  });

  it("입력 비어도 안전", () => {
    expect(computeTreasureSeasonPayouts([]).size).toBe(0);
  });
});
