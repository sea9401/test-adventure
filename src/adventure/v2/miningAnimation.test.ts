import { describe, expect, it } from "vitest";
import { miningAnimationFrame } from "./miningAnimation";

describe("채광 애니메이션 타이밍", () => {
  it("시간에 따라 곡괭이 타격 횟수와 손상이 증가한다", () => {
    const before = miningAnimationFrame(0, 7_000, 5);
    const middle = miningAnimationFrame(3_500, 7_000, 5);
    const done = miningAnimationFrame(7_000, 7_000, 5);
    expect(before.strikeCount).toBe(0);
    expect(middle.strikeCount).toBeGreaterThan(0);
    expect(done).toMatchObject({ strikeCount: 5, damage: 1 });
  });

  it("타격 시점에만 충격 강도가 생긴다", () => {
    expect(miningAnimationFrame(0, 10_000, 5).impact).toBe(0);
    expect(miningAnimationFrame(760, 10_000, 5).impact).toBeGreaterThan(0.9);
  });
});
