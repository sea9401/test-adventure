import { describe, expect, it } from "vitest";
import { filterRankingEligibleRows } from "./rankingEligibility";

describe("filterRankingEligibleRows", () => {
  it("현재 정지 중인 계정만 랭킹 후보에서 제외한다", () => {
    const now = new Date("2026-08-13T13:00:00.000Z");
    const rows = [
      { id: "active", bannedUntil: null },
      { id: "expired", bannedUntil: new Date("2026-08-13T12:59:59.999Z") },
      { id: "temporary-ban", bannedUntil: new Date("2026-08-13T13:00:00.001Z") },
      { id: "permanent-ban", bannedUntil: new Date("9999-12-31T23:59:59.999Z") },
    ];

    expect(filterRankingEligibleRows(rows, now).map((row) => row.id)).toEqual([
      "active",
      "expired",
    ]);
  });
});
