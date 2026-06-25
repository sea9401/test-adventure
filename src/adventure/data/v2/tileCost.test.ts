// 리베라(중앙) 거리 기반 비용 — 순수 헬퍼 단위 테스트.
//   가법 골드(1칸 범위=기본·바깥 1칸당 +2천만)·자원 배수·승격 multiplier 검증.

import { describe, expect, it } from "vitest";
import {
  tileDistanceFromCenter,
  tileExtraRings,
  tileCostMultiplier,
  scaledTileGoldCost,
  scaledTileResourceCost,
  tileSlotUnlockGoldCost,
  TILE_COST_GOLD_STEP_PER_RING,
} from "./tileConfig";
import { canUpgrade, applyUpgradeCost } from "./settlement";

describe("tileDistanceFromCenter / tileExtraRings (리베라 중앙)", () => {
  it("중앙(4,4)=0, 1칸 범위=1, 코너=4 (체비셰프)", () => {
    expect(tileDistanceFromCenter(4, 4)).toBe(0);
    expect(tileDistanceFromCenter(4, 5)).toBe(1);
    expect(tileDistanceFromCenter(5, 5)).toBe(1); // 대각도 1
    expect(tileDistanceFromCenter(0, 0)).toBe(4);
  });
  it("추가 링 = max(0, 거리-1) 상한 2 — 1칸 범위(거리1)=0·거리3↑=2", () => {
    expect(tileExtraRings(4, 5)).toBe(0); // 거리1 = 가산 0
    expect(tileExtraRings(4, 6)).toBe(1); // 거리2
    expect(tileExtraRings(4, 7)).toBe(2); // 거리3
    expect(tileExtraRings(0, 0)).toBe(2); // 거리4 = 상한(거리3과 동일)
  });
});

describe("골드 비용(가법) — 1칸 범위=기본·바깥 1칸당 +2천만·거리3↑ 상한", () => {
  const BASE = 10_000_000;
  it("1칸 범위(거리1)=기본 1천만", () => {
    expect(scaledTileGoldCost(BASE, 4, 5)).toBe(10_000_000);
  });
  it("거리2=3천만·거리3=5천만·거리4=5천만(상한)", () => {
    expect(scaledTileGoldCost(BASE, 4, 6)).toBe(30_000_000); // +1링
    expect(scaledTileGoldCost(BASE, 4, 7)).toBe(50_000_000); // +2링(거리3)
    expect(scaledTileGoldCost(BASE, 0, 0)).toBe(50_000_000); // 거리4=상한 동일
  });
  it("STEP = 2천만/링", () => {
    expect(TILE_COST_GOLD_STEP_PER_RING).toBe(20_000_000);
    expect(scaledTileGoldCost(0, 4, 6) - scaledTileGoldCost(0, 4, 5)).toBe(
      20_000_000,
    );
  });
  it("기본이 다른 비용에도 같은 +2천만/링 가산(예: 칸 해금 5천만)", () => {
    expect(scaledTileGoldCost(50_000_000, 4, 5)).toBe(50_000_000); // 1칸 범위=기본
    expect(scaledTileGoldCost(50_000_000, 4, 6)).toBe(70_000_000); // +2천만
  });
});

describe("자원 비용 배수 — 1칸 범위=1×·바깥 1칸당 +1×·거리3↑ 상한", () => {
  it("거리1=1×·거리2=2×·거리4=3×(상한)", () => {
    expect(tileCostMultiplier(4, 5)).toBe(1);
    expect(tileCostMultiplier(4, 6)).toBe(2);
    expect(tileCostMultiplier(0, 0)).toBe(3); // 거리4=상한(거리3과 동일)
  });
  it("종류별 거리 배수(반올림)", () => {
    expect(scaledTileResourceCost({ crop: 400, ore: 250 }, 4, 5)).toEqual({
      crop: 400,
      ore: 250,
    }); // 1칸 범위=기본
    expect(scaledTileResourceCost({ crop: 400, ore: 250 }, 0, 0)).toEqual({
      crop: 1200,
      ore: 750,
    }); // ×3(상한)
  });
});

describe("tileSlotUnlockGoldCost (칸 해금 고정 누진·거리 무관)", () => {
  it("첫칸 5천만·2번째 1억 (마을 판 2칸·INITIAL=0 → 0-기준)", () => {
    expect(tileSlotUnlockGoldCost(0)).toBe(50_000_000);
    expect(tileSlotUnlockGoldCost(1)).toBe(100_000_000);
  });
  it("인덱스 2 이후=1억 상한 폴백(달성 칸은 무료라 실제 호출 안 됨)", () => {
    expect(tileSlotUnlockGoldCost(2)).toBe(100_000_000);
    expect(tileSlotUnlockGoldCost(8)).toBe(100_000_000);
  });
});

describe("canUpgrade/applyUpgradeCost costMultiplier (단계 승격 자원)", () => {
  const exact = { crop: 400, ore: 250 };
  it("기본(1) — 옛 거점 경로 불변", () => {
    expect(canUpgrade("village", 2, exact).ok).toBe(true);
    expect(applyUpgradeCost("village", exact).crop).toBe(0);
  });
  it("배수 2 — 자원 2배 요구(검증·차감 일치)", () => {
    expect(canUpgrade("village", 2, exact, 2).ok).toBe(false);
    const doubled = { crop: 800, ore: 500 };
    expect(canUpgrade("village", 2, doubled, 2).ok).toBe(true);
    const after = applyUpgradeCost("village", doubled, 2);
    expect(after.crop).toBe(0);
    expect(after.ore).toBe(0);
  });
});
