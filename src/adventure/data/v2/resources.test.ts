import { describe, it, expect } from "vitest";
import {
  STONE_YIELD_PER_HOUR,
  HARVEST_OFFLINE_CAP_HOURS,
  computeStoneYield,
  parseResources,
} from "./resources";

describe("자원 산출 — computeStoneYield", () => {
  const now = 10_000_000_000;
  const HOUR = 3600_000;

  it("0 시간 → 0 stone", () => {
    expect(computeStoneYield(1, now, now).gained).toBe(0);
  });

  it("1 시간 → tier 산출량 그대로", () => {
    for (const tier of [1, 2, 3, 4] as const) {
      expect(computeStoneYield(tier, now - HOUR, now).gained).toBe(
        STONE_YIELD_PER_HOUR[tier],
      );
    }
  });

  it("4 시간 = 4 × 산출량", () => {
    expect(computeStoneYield(2, now - 4 * HOUR, now).gained).toBe(
      4 * STONE_YIELD_PER_HOUR[2],
    );
  });

  it("offline cap — 24+ 시간 흘러도 24시간치만", () => {
    const r = computeStoneYield(4, now - 100 * HOUR, now);
    expect(r.gained).toBe(HARVEST_OFFLINE_CAP_HOURS * STONE_YIELD_PER_HOUR[4]);
    expect(r.effectiveHours).toBe(HARVEST_OFFLINE_CAP_HOURS);
  });

  it("정확히 24h 경계 — cap 그대로", () => {
    const r = computeStoneYield(2, now - HARVEST_OFFLINE_CAP_HOURS * HOUR, now);
    expect(r.gained).toBe(
      HARVEST_OFFLINE_CAP_HOURS * STONE_YIELD_PER_HOUR[2],
    );
    expect(r.effectiveHours).toBe(HARVEST_OFFLINE_CAP_HOURS);
  });

  it("24h 1ms 초과 — cap 동일 (1ms 손실)", () => {
    const r = computeStoneYield(
      3,
      now - HARVEST_OFFLINE_CAP_HOURS * HOUR - 1,
      now,
    );
    expect(r.gained).toBe(
      HARVEST_OFFLINE_CAP_HOURS * STONE_YIELD_PER_HOUR[3],
    );
    expect(r.effectiveHours).toBe(HARVEST_OFFLINE_CAP_HOURS);
  });

  it("미래 시점 lastHarvested — 0 (음수 elapsed 보호)", () => {
    expect(computeStoneYield(3, now + HOUR, now).gained).toBe(0);
  });
});

describe("자원 — parseResources", () => {
  it("비객체 / null → 기본 0", () => {
    expect(parseResources(undefined).stone).toBe(0);
    expect(parseResources(null).stone).toBe(0);
    expect(parseResources("garbage").stone).toBe(0);
  });

  it("정상 객체 — 정수로 floor", () => {
    expect(parseResources({ stone: 12.7 }).stone).toBe(12);
  });

  it("음수 → 0 으로 clamp", () => {
    expect(parseResources({ stone: -50 }).stone).toBe(0);
  });

  it("NaN/Infinity → 0", () => {
    expect(parseResources({ stone: NaN }).stone).toBe(0);
    expect(parseResources({ stone: Infinity }).stone).toBe(0);
  });
});
