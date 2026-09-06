import { describe, expect, it } from "vitest";
import { clampHours, summarizeAbuse, summarizeEconomy, topCounts } from "./opsDashboardModel";

describe("operations dashboard read model", () => {
  it("preserves the supported period buckets", () => {
    expect([NaN, -1, 1, 2, 6, 7, 24, 25].map(clampHours)).toEqual([24, 1, 1, 6, 6, 24, 24, 168]);
  });
  it("counts inclusive time boundaries and rate-limit events", () => {
    const now = 10_000_000;
    const rows = [300_000, 300_001, 3_600_000, 3_600_001].map((age) => ({
      action: "mine", reason: "rate_limited", userId: "u", ip: null, createdAt: new Date(now - age),
    }));
    expect(summarizeAbuse(rows, now)).toMatchObject({ last5m: 1, last1h: 3, last24h: 4, rateLimited24h: 4, topIps: [] });
  });
  it("keeps incoming and outgoing gold separate", () => {
    const rows = [120, -50, 0].map((goldDelta) => ({
      eventType: "reward.gold", goldDelta, itemKind: null, itemId: null, quantity: null, createdAt: new Date(0),
    }));
    expect(summarizeEconomy(rows, 0)).toMatchObject({ goldIn24h: 120, goldOut24h: 50, last24h: 3 });
    expect(topCounts(["a", "b", "b"])).toEqual([{ key: "b", count: 2 }, { key: "a", count: 1 }]);
  });
});
