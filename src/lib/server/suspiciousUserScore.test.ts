import { describe, expect, it } from "vitest";
import {
  FISHING_SUSPICION_INCIDENT_WINDOW_MS,
  scoreSuspiciousUsers,
  type SuspicionScoreEvent,
} from "./suspiciousUserScore";

function event(
  reason: string,
  action: string,
  at: number,
  detail?: unknown,
): SuspicionScoreEvent {
  return {
    userId: "u-fisher",
    ip: "127.0.0.1",
    reason,
    action,
    detail,
    createdAt: new Date(at),
  };
}

describe("suspicious user score", () => {
  it("counts correlated fishing protection events as one incident", () => {
    const rows = scoreSuspiciousUsers([
      event("fishing_macro_pattern", "v2:fishing:reel", 10_000),
      event("strong_activity_signal", "v2:fishing:activity-guard", 10_010),
      event("human_verification_required", "v2:fishing:human-check", 10_020),
    ]);

    expect(rows[0]).toMatchObject({
      events: 1,
      actionCount: 1,
      score: 26,
      severity: "watch",
    });
    expect(rows[0]?.recentEvents).toHaveLength(3);
  });

  it("keeps fishing incidents outside the correlation window separate", () => {
    const rows = scoreSuspiciousUsers([
      event("fishing_macro_pattern", "v2:fishing:reel", 10_000),
      event(
        "fishing_macro_pattern",
        "v2:fishing:reel",
        10_000 + FISHING_SUSPICION_INCIDENT_WINDOW_MS + 1,
      ),
    ]);

    expect(rows[0]).toMatchObject({ events: 2, score: 52 });
  });

  it("does not collapse unrelated activity or non-fishing signals", () => {
    const rows = scoreSuspiciousUsers([
      event("fishing_macro_pattern", "v2:fishing:reel", 10_000),
      event("strong_activity_signal", "v2:mining:activity-guard", 10_010),
      event("rate_limited", "v2:marketplace:buy", 10_020),
    ]);

    expect(rows[0]).toMatchObject({
      events: 3,
      rateLimited: 1,
      actionCount: 3,
      score: 59,
      severity: "watch",
    });
  });

  it("excludes historical fishing flags that contain no strong signal", () => {
    const rows = scoreSuspiciousUsers([
      event("fishing_macro_pattern", "v2:fishing:reel", 10_000, {
        signals: ["near_perfect_success_rate", "uniform_client_reaction"],
      }),
      event("rate_limited", "v2:marketplace:buy", 20_000),
    ]);

    expect(rows[0]).toMatchObject({ events: 1, rateLimited: 1, score: 7 });
    expect(rows[0]?.recentEvents).toHaveLength(2);
  });

  it("excludes administrator-requested verification tests from suspicion scoring", () => {
    const rows = scoreSuspiciousUsers([
      event("human_verification_required", "v2:mining:human-check", 10_000, {
        manualTest: true,
      }),
      event("human_verification_failed", "v2:mining:human-check", 11_000, {
        manualTest: true,
      }),
      event("human_verification_succeeded", "v2:mining:human-check", 12_000, {
        manualTest: true,
      }),
    ]);

    expect(rows).toEqual([]);
  });
});
