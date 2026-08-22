import { describe, expect, it } from "vitest";
import type { DangerousRealtimeView } from "./dangerousFishingRealtime";
import {
  fishPoseAt,
  lineCurveAt,
  sceneEffectsFor,
  staticFallbackFor,
  tailWeightForSlice,
} from "./dangerousFishingRealtimeRender";

function viewFixture(
  overrides: Partial<DangerousRealtimeView> = {},
): DangerousRealtimeView {
  return {
    tick: 10,
    mode: "release",
    status: "active",
    tension: 500,
    maxTension: 1_000,
    stamina: 7_500,
    maxStamina: 10_000,
    distance: 8_000,
    startDistance: 10_000,
    lowTensionTicks: 0,
    behavior: "turn",
    behaviorCursor: 0,
    phase: "active",
    phaseTicksRemaining: 5,
    chainRemaining: 0,
    targetTicks: 200,
    maxTicks: 400,
    performanceScalePermille: 1_000,
    safeTensionMin: 300,
    safeTensionMax: 700,
    remainingTicks: 390,
    telegraphs: [],
    ...overrides,
  };
}

describe("위험 해역 실시간 렌더 모델", () => {
  it("오른쪽을 보는 출고 어종의 머리 대신 왼쪽 꼬리에 변형을 집중한다", () => {
    expect(tailWeightForSlice(0, 5, "right")).toBe(1);
    expect(tailWeightForSlice(2, 5, "right")).toBe(0.25);
    expect(tailWeightForSlice(4, 5, "right")).toBe(0);
  });

  it("심층 위험도 5의 입자·흔들림·광량 분기 변이를 잡는다", () => {
    expect(sceneEffectsFor("deep", 5, false)).toMatchObject({
      particleDensity: 3,
      shakeStrength: 2,
      lightLevel: 0,
    });
  });

  it("동작 줄이기에서 장면 흔들림이 되살아나는 변이를 잡는다", () => {
    expect(sceneEffectsFor("deep", 5, true)).toMatchObject({
      particleDensity: 1,
      shakeStrength: 0,
      lightLevel: 0,
    });
  });

  it("잠수 행동을 아래 방향이 아닌 다른 분기에 연결하는 변이를 잡는다", () => {
    expect(fishPoseAt(viewFixture({ behavior: "dive" }), 500)).toMatchObject({
      direction: "down",
    });
  });

  it("거리와 체력이 다른 인접 스냅샷 사이의 위치·크기 점프를 잡는다", () => {
    const previous = viewFixture({
      tick: 10,
      phase: "idle",
      distance: 8_000,
      stamina: 7_500,
    });
    const current = viewFixture({
      tick: 11,
      phase: "idle",
      distance: 7_900,
      stamina: 7_000,
    });

    const start = fishPoseAt(current, 0, previous);
    const middle = fishPoseAt(current, 25, previous);
    const end = fishPoseAt(current, 50, previous);

    expect(start.x).toBeCloseTo(0.432, 8);
    expect(start.scale).toBeCloseTo(0.84, 8);
    expect(middle.x).toBeCloseTo(0.4338, 8);
    expect(middle.scale).toBeCloseTo(0.842, 8);
    expect(end.x).toBeCloseTo(0.4356, 8);
    expect(end.scale).toBeCloseTo(0.844, 8);
  });

  it("장력이 커질수록 낚싯줄이 더 처지는 역전 변이를 잡는다", () => {
    const pose = fishPoseAt(viewFixture(), 0);
    const slack = lineCurveAt(pose, 0);
    const taut = lineCurveAt(pose, 1);

    expect(slack.control.y).toBeGreaterThan(taut.control.y);
    expect(taut.start).toEqual({ x: 0.9, y: 0.06 });
    expect(taut.end.x).toBeLessThan(pose.x);
  });

  it("Canvas 실패 fallback에 애니메이션이나 배경 이미지가 복귀하는 변이를 잡는다", () => {
    expect(staticFallbackFor(viewFixture())).toMatchObject({
      background: "solid-underwater",
      animated: false,
    });
  });
});
