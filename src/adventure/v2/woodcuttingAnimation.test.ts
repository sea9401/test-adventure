import { describe, expect, it } from "vitest";
import {
  WOODCUTTING_TREE_FALL_MS,
  woodcuttingAnimationFrame,
} from "./woodcuttingAnimation";

describe("벌목 캔버스 타이밍", () => {
  it("표시 도끼질과 절단 피해가 실제 타격 시점에 함께 증가한다", () => {
    const before = woodcuttingAnimationFrame(900, 7_000, 5);
    const after = woodcuttingAnimationFrame(930, 7_000, 5);
    expect(before).toMatchObject({ chopCount: 0, damage: 0, impact: 0 });
    expect(after.chopCount).toBe(1);
    expect(after.damage).toBeCloseTo(0.2);
    expect(after.impact).toBeGreaterThan(0);
  });

  it("마지막 타격 뒤 절단 완료와 쓰러짐을 순서대로 진행한다", () => {
    expect(woodcuttingAnimationFrame(7_000, 7_000, 5)).toMatchObject({
      progress: 1,
      chopCount: 5,
      damage: 1,
      fall: 0,
    });
    const falling = woodcuttingAnimationFrame(
      7_000 + WOODCUTTING_TREE_FALL_MS / 2,
      7_000,
      5,
    );
    expect(falling.fall).toBeGreaterThan(0.5);
    expect(woodcuttingAnimationFrame(7_000 + WOODCUTTING_TREE_FALL_MS, 7_000, 5).fall).toBe(1);
  });

  it("모션 감소 설정에서는 흔들림 충격 없이 연속 진행도를 사용한다", () => {
    const frame = woodcuttingAnimationFrame(3_500, 7_000, 5, true);
    expect(frame).toMatchObject({ progress: 0.5, damage: 0.5, impact: 0 });
  });
});
