// 리베라(중앙) 거리 기반 비용 스케일 — 순수 헬퍼 단위 테스트.
//   거리(체비셰프)·골드/자원 배수·승격 자원비 multiplier 동작 검증.

import { describe, expect, it } from "vitest";
import {
  tileDistanceFromCenter,
  tileCostMultiplier,
  scaledTileGoldCost,
  scaledTileResourceCost,
  TILE_COST_DISTANCE_STEP,
  TILE_BOARD_CENTER,
} from "./tileConfig";
import { canUpgrade, applyUpgradeCost } from "./settlement";

describe("tileDistanceFromCenter (리베라 중앙 체비셰프 거리)", () => {
  it("중앙(4,4)=0", () => {
    expect(
      tileDistanceFromCenter(TILE_BOARD_CENTER, TILE_BOARD_CENTER),
    ).toBe(0);
  });
  it("한 칸 바깥=1 (대각도 1)", () => {
    expect(tileDistanceFromCenter(4, 5)).toBe(1);
    expect(tileDistanceFromCenter(5, 5)).toBe(1);
  });
  it("코너/가장자리=4 (9×9)", () => {
    expect(tileDistanceFromCenter(0, 0)).toBe(4);
    expect(tileDistanceFromCenter(4, 0)).toBe(4);
    expect(tileDistanceFromCenter(8, 8)).toBe(4);
  });
});

describe("거리 비용 배수 — 중앙=기본·멀수록↑", () => {
  it("중앙=1× (골드 기본비용 불변)", () => {
    expect(tileCostMultiplier(4, 4)).toBe(1);
    expect(scaledTileGoldCost(10_000_000, 4, 4)).toBe(10_000_000);
  });
  it("거리당 +STEP 선형 — 코너(거리4)=1+4×STEP", () => {
    const m = 1 + 4 * TILE_COST_DISTANCE_STEP;
    expect(tileCostMultiplier(0, 0)).toBe(m);
    expect(scaledTileGoldCost(10_000_000, 0, 0)).toBe(
      Math.round(10_000_000 * m),
    );
  });
  it("자원 비용도 종류별 거리 스케일(반올림)", () => {
    const m = 1 + 4 * TILE_COST_DISTANCE_STEP;
    const scaled = scaledTileResourceCost({ crop: 400, ore: 250 }, 0, 0);
    expect(scaled.crop).toBe(Math.round(400 * m));
    expect(scaled.ore).toBe(Math.round(250 * m));
  });
  it("멀수록 단조 증가", () => {
    const c0 = scaledTileGoldCost(1_000_000, 4, 4);
    const c1 = scaledTileGoldCost(1_000_000, 4, 6);
    const c2 = scaledTileGoldCost(1_000_000, 0, 0);
    expect(c0).toBeLessThan(c1);
    expect(c1).toBeLessThan(c2);
  });
});

describe("canUpgrade/applyUpgradeCost costMultiplier (단계 승격 자원 거리 스케일)", () => {
  // village→city 기본 자원비 = { crop:400, ore:250, fish:120 }, 판 4칸 다 채워야(needSlots).
  const exact = { crop: 400, ore: 250, fish: 120 };

  it("기본(multiplier 미지정=1) — 옛 거점 경로 불변", () => {
    expect(canUpgrade("village", 4, exact).ok).toBe(true);
    const after = applyUpgradeCost("village", exact);
    expect(after.crop).toBe(0);
    expect(after.ore).toBe(0);
  });

  it("배수 2 — 자원 2배 요구(검증·차감 일치)", () => {
    expect(canUpgrade("village", 4, exact, 2).ok).toBe(false); // 800/500/240 필요
    const doubled = { crop: 800, ore: 500, fish: 240 };
    expect(canUpgrade("village", 4, doubled, 2).ok).toBe(true);
    const after = applyUpgradeCost("village", doubled, 2);
    expect(after.crop).toBe(0);
    expect(after.ore).toBe(0);
    expect(after.fish).toBe(0);
  });
});
