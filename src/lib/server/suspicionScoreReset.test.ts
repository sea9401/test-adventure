import { describe, expect, it } from "vitest";
import {
  rowsAfterSuspicionScoreReset,
  suspicionScoreResetCutoffs,
} from "./suspicionScoreReset";

describe("suspicion score reset baseline", () => {
  it("uses the newest reset marker for each user", () => {
    const cutoffs = suspicionScoreResetCutoffs([
      { targetUserId: "user-a", createdAt: new Date(100) },
      { targetUserId: "user-a", createdAt: new Date(300) },
      { targetUserId: "user-b", createdAt: new Date(200) },
      { targetUserId: null, createdAt: new Date(999) },
    ]);

    expect(cutoffs.get("user-a")).toBe(300);
    expect(cutoffs.get("user-b")).toBe(200);
    expect(cutoffs.size).toBe(2);
  });

  it("keeps audit source rows but scores only events after the reset", () => {
    const cutoffs = new Map([["user-a", 200]]);
    const rows = [
      { id: 1, userId: "user-a", createdAt: new Date(100) },
      { id: 2, userId: "user-a", createdAt: new Date(200) },
      { id: 3, userId: "user-a", createdAt: new Date(201) },
      { id: 4, userId: "user-b", createdAt: new Date(100) },
      { id: 5, userId: null, createdAt: new Date(100) },
    ];

    expect(rowsAfterSuspicionScoreReset(rows, cutoffs).map((row) => row.id)).toEqual([
      3, 4, 5,
    ]);
    expect(rows).toHaveLength(5);
  });
});
