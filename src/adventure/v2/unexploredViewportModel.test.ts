import { describe, expect, it } from "vitest";
import {
  clampUnexploredScale,
  panUnexploredBy,
  zoomUnexploredAt,
} from "./unexploredViewportModel";

describe("미개척지 탐사망 뷰포트 계산", () => {
  it("배율을 50~250%로 제한한다", () => {
    expect(clampUnexploredScale(0.25)).toBe(0.5);
    expect(clampUnexploredScale(1.75)).toBe(1.75);
    expect(clampUnexploredScale(3)).toBe(2.5);
  });

  it("포인터 기준점을 고정한 채 확대한다", () => {
    expect(
      zoomUnexploredAt(
        { scale: 1, x: 0, y: 0 },
        2,
        { x: 500, y: 400 },
      ),
    ).toEqual({ scale: 2, x: -500, y: -400 });
  });

  it("SVG 좌표 델타만큼 이동한다", () => {
    expect(
      panUnexploredBy(
        { scale: 1.5, x: -100, y: 20 },
        { x: 30, y: -40 },
      ),
    ).toEqual({ scale: 1.5, x: -70, y: -20 });
  });
});
