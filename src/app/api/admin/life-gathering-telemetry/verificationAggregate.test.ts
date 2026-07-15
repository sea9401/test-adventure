import { describe, expect, it } from "vitest";
import { aggregateActivityGuardTelemetry } from "./verificationAggregate";

describe("aggregateActivityGuardTelemetry", () => {
  it("인증 요구·성공·실패와 행동 패턴을 계정별로 집계한다", () => {
    const result = aggregateActivityGuardTelemetry([
      {
        userId: "u1",
        gameName: "연이",
        action: "v2:fishing:human-check",
        reason: "human_verification_succeeded",
        detail: { nextCheckpointTarget: 70 },
        createdAt: new Date("2026-07-15T10:05:00Z"),
      },
      {
        userId: "u1",
        gameName: "연이",
        action: "v2:fishing:human-check",
        reason: "human_verification_required",
        detail: { checkpointTarget: 80 },
        createdAt: new Date("2026-07-15T10:04:00Z"),
      },
      {
        userId: "u1",
        gameName: "연이",
        action: "v2:fishing:activity-guard",
        reason: "activity_behavior_pattern",
        detail: { signal: "near_perfect_uniform_fishing" },
        createdAt: new Date("2026-07-15T10:03:00Z"),
      },
      {
        userId: "u2",
        gameName: "테스터",
        action: "v2:mining:human-check",
        reason: "human_verification_failed",
        detail: null,
        createdAt: new Date("2026-07-15T10:02:00Z"),
      },
    ]);

    expect(result.totals).toEqual({
      required: 1,
      succeeded: 1,
      failed: 1,
      behaviorPatterns: 1,
    });
    expect(result.topUsers[0]).toMatchObject({
      userId: "u1",
      required: 1,
      succeeded: 1,
      behaviorPatterns: 1,
    });
    expect(result.recent[0]).toMatchObject({
      activity: "fishing",
      reason: "human_verification_succeeded",
    });
  });
});
