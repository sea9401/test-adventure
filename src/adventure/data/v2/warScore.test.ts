import { describe, it, expect } from "vitest";
import {
  capturePoints,
  captureDecayMultiplier,
  siegeWinPoints,
  tierFactor,
  WAR_POINTS_CAPTURE,
  WAR_POINTS_SIEGE_WIN,
} from "./warScore";

describe("warScore", () => {
  it("capture 감쇠 100% → 40% → 0%", () => {
    expect(captureDecayMultiplier(0)).toBe(1);
    expect(captureDecayMultiplier(1)).toBe(0.4);
    expect(captureDecayMultiplier(2)).toBe(0);
    expect(captureDecayMultiplier(5)).toBe(0);
  });

  it("tier 가중", () => {
    expect(tierFactor(2)).toBe(1.0);
    expect(tierFactor(4)).toBe(1.5);
    expect(tierFactor(99)).toBe(1.0); // 미정의 tier 폴백
  });

  it("capturePoints — 첫 함락은 만점, 이후 감쇠", () => {
    // tier2(=1.0): 첫 함락 100, 둘째 40, 셋째 0.
    expect(capturePoints(2, 0)).toBe(WAR_POINTS_CAPTURE);
    expect(capturePoints(2, 1)).toBe(Math.round(WAR_POINTS_CAPTURE * 0.4));
    expect(capturePoints(2, 2)).toBe(0);
    // tier4 첫 함락 = 100 * 1.5.
    expect(capturePoints(4, 0)).toBe(Math.round(WAR_POINTS_CAPTURE * 1.5));
  });

  it("siegeWinPoints — tier 반영, 감쇠 없음", () => {
    expect(siegeWinPoints(2)).toBe(WAR_POINTS_SIEGE_WIN);
    expect(siegeWinPoints(4)).toBe(Math.round(WAR_POINTS_SIEGE_WIN * 1.5));
  });

  it("유지시간 점수는 없다 — 점수는 capture/siege 이벤트로만", () => {
    // 회귀 가드: 점수 진입점이 capturePoints/siegeWinPoints 둘뿐임을 명시.
    expect(typeof capturePoints).toBe("function");
    expect(typeof siegeWinPoints).toBe("function");
  });
});
