import { describe, expect, it } from "vitest";

import {
  nextReleasePhase,
  type StagingReleaseState,
} from "./releaseState";

const verified: StagingReleaseState = {
  phase: "verified",
  branch: "feat/echo-warden",
  verifiedSha: "a".repeat(40),
  phases: { verified: { sha: "a".repeat(40) } },
};

describe("nextReleasePhase", () => {
  it("advances monotonically and accepts an identical replay", () => {
    const pushed = nextReleasePhase(verified, {
      phase: "pushed",
      data: { sha: "a".repeat(40) },
    });
    expect(pushed.phase).toBe("pushed");
    expect(
      nextReleasePhase(pushed, {
        phase: "pushed",
        data: { sha: "a".repeat(40) },
      }),
    ).toEqual(pushed);
  });

  it("rejects out-of-order and conflicting repeated events", () => {
    expect(() =>
      nextReleasePhase(verified, {
        phase: "pr-open",
        data: { prNumber: 2501 },
      }),
    ).toThrow("release event pr-open is out of order");
    const pushed = nextReleasePhase(verified, {
      phase: "pushed",
      data: { sha: "a".repeat(40) },
    });
    expect(() =>
      nextReleasePhase(pushed, {
        phase: "pushed",
        data: { sha: "b".repeat(40) },
      }),
    ).toThrow("release event pushed conflicts with persisted data");
  });
});
