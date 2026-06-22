import { describe, it, expect } from "vitest";
import {
  TILE_SETTLEMENT_TIERS,
  TILE_YIELD_PER_HOUR,
  TILE_YIELD_CAP_HOURS,
  TILE_YIELD_LEVEL_CAP,
  TILE_YIELD_LEVEL_SLOPE,
  tilePendingYield,
  tileYieldLevelMult,
  tileNextTier,
  tileTierOwnsLand,
} from "./tileConfig";

// 자유 타일 지도 Phase 4 — 정착지 idle 골드 생산/수확 순수 로직.
const HOUR = 3_600_000;

describe("tilePendingYield — 시간당 누적 + 캡", () => {
  it("개척마을(frontier)은 땅 미보유 = 생산 0", () => {
    expect(TILE_YIELD_PER_HOUR.frontier).toBe(0);
    expect(tileTierOwnsLand("frontier")).toBe(false);
    expect(tilePendingYield("frontier", 0, 100 * HOUR)).toBe(0);
  });

  it("경과시간 × 시급(내림) — 마을 2.5h = floor(시급×2.5)", () => {
    expect(tilePendingYield("village", 0, 2.5 * HOUR)).toBe(
      Math.floor(TILE_YIELD_PER_HOUR.village * 2.5),
    );
  });

  it("캡 시간 이상은 상한에서 멈춘다(무한 idle 방어)", () => {
    const capped = TILE_YIELD_PER_HOUR.village * TILE_YIELD_CAP_HOURS;
    expect(tilePendingYield("village", 0, 100 * HOUR)).toBe(capped);
    // 캡 직전/직후 동일.
    expect(tilePendingYield("village", 0, TILE_YIELD_CAP_HOURS * HOUR)).toBe(
      capped,
    );
  });

  it("과거 음수 경과는 0(시계 역행 방어)", () => {
    expect(tilePendingYield("village", 10 * HOUR, 5 * HOUR)).toBe(0);
  });

  it("티어가 높을수록 시급↑ (frontier < village < city < metropolis)", () => {
    const rates = TILE_SETTLEMENT_TIERS.map((t) => TILE_YIELD_PER_HOUR[t]);
    for (let i = 1; i < rates.length; i++) {
      expect(rates[i]).toBeGreaterThan(rates[i - 1]);
    }
  });
});

describe("tileYieldLevelMult — 진행도(레벨) 연동 시급 배율", () => {
  it("L1 = 1.0× (앵커·현행 시급 유지)", () => {
    expect(tileYieldLevelMult(1)).toBe(1);
    // 레벨 미지정(기본 1)도 동일.
    expect(tilePendingYield("village", 0, 1 * HOUR)).toBe(
      TILE_YIELD_PER_HOUR.village,
    );
  });

  it("레벨캡 = 1 + (cap-1)×slope (선형 상한)", () => {
    const capMult = 1 + (TILE_YIELD_LEVEL_CAP - 1) * TILE_YIELD_LEVEL_SLOPE;
    expect(tileYieldLevelMult(TILE_YIELD_LEVEL_CAP)).toBeCloseTo(capMult, 9);
    // 캡 밖(>cap)은 캡에서 멈춘다.
    expect(tileYieldLevelMult(TILE_YIELD_LEVEL_CAP + 50)).toBeCloseTo(capMult, 9);
  });

  it("레벨 단조 증가 + 시급에 곱해진다", () => {
    expect(tileYieldLevelMult(50)).toBeGreaterThan(tileYieldLevelMult(10));
    // 마을 1h @ L100 = floor(기준 × cap배율).
    const capMult = 1 + (TILE_YIELD_LEVEL_CAP - 1) * TILE_YIELD_LEVEL_SLOPE;
    expect(
      tilePendingYield("village", 0, 1 * HOUR, TILE_YIELD_LEVEL_CAP),
    ).toBe(Math.floor(TILE_YIELD_PER_HOUR.village * capMult));
  });

  it("0/음수 레벨 방어 = 1.0×", () => {
    expect(tileYieldLevelMult(0)).toBe(1);
    expect(tileYieldLevelMult(-5)).toBe(1);
  });
});

describe("tileNextTier — 승격 사슬", () => {
  it("frontier→village→city→metropolis→null(최고)", () => {
    expect(tileNextTier("frontier")).toBe("village");
    expect(tileNextTier("village")).toBe("city");
    expect(tileNextTier("city")).toBe("metropolis");
    expect(tileNextTier("metropolis")).toBeNull();
  });
});
