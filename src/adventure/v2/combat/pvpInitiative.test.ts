import { describe, expect, it } from "vitest";
import {
  pickPvpInitiative,
  pvpInitiativeChance,
} from "./pvpInitiative";

describe("PvP 속도 가중 선공", () => {
  it("속도가 같으면 p1 선공 확률이 정확히 50%다", () => {
    expect(pvpInitiativeChance(60, 60)).toBe(0.5);
  });

  it("기본 티켓과 압축 행동 속도로 완만하게 가중한다", () => {
    expect(pvpInitiativeChance(60, 30)).toBeCloseTo(
      0.5388174758013845,
      12,
    );
  });

  it("극단적인 속도 차이에도 선공 확률을 35%-65%로 제한한다", () => {
    expect(pvpInitiativeChance(1_024, 1)).toBe(0.65);
    expect(pvpInitiativeChance(1, 1_024)).toBe(0.35);
  });

  it("주입한 추첨값으로 양쪽 모두 동속 선공자가 될 수 있다", () => {
    expect(pickPvpInitiative(60, 60, 0.499999)).toBe("p1");
    expect(pickPvpInitiative(60, 60, 0.5)).toBe("p2");
  });
});
