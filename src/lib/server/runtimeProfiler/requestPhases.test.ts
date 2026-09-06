import { describe, expect, it } from "vitest";
import { createRequestProfile, recordDatabaseQuery, runWithRequestProfile } from "./requestContext";
import { createRequestPhaseTracker } from "./requestPhases";
import { createProfilerAggregator } from "./aggregate";

const profile = () => createRequestProfile({ feature: "combat", operation: "POST /api/v2/dungeon/hunt", method: "POST", startedAtNs: BigInt(0), socketBytesAtStart: 0 });

describe("request phases", () => {
  it("captures sequential wall time and query deltas, closes failures once, and serializes independent snapshots", () => {
    const p = profile();
    let now = BigInt(0);
    runWithRequestProfile(p, () => {
      const tracker = createRequestPhaseTracker(() => now);
      tracker.enter("hunt.prepare");
      recordDatabaseQuery(p, 3, false);
      now = BigInt(10_000_000);
      tracker.enter("hunt.battle");
      now = BigInt(30_000_000);
      tracker.enter("hunt.settlement");
      recordDatabaseQuery(p, 5, true);
      now = BigInt(40_000_000);
      tracker.finish(true);
      tracker.finish(true);
    });
    const aggregator = createProfilerAggregator();
    aggregator.recordRequest({ ...p, statusCode: 500, durationMs: 40, responseBytes: 0 });
    const first = aggregator.snapshot();
    expect(first.current.operations[p.operation].phases).toEqual({
      "hunt.prepare": { count: 1, failed: 0, totalMs: 10, maxMs: 10, dbQueries: 1, dbMs: 3 },
      "hunt.battle": { count: 1, failed: 0, totalMs: 20, maxMs: 20, dbQueries: 0, dbMs: 0 },
      "hunt.settlement": { count: 1, failed: 1, totalMs: 10, maxMs: 10, dbQueries: 1, dbMs: 5 },
    });
    aggregator.recordRequest({ ...p, statusCode: 200, durationMs: 40, responseBytes: 0 });
    expect(aggregator.snapshot().current.operations[p.operation].phases?.["hunt.prepare"]?.count).toBe(2);
    expect(first.current.operations[p.operation].phases?.["hunt.prepare"]?.count).toBe(1);
  });

  it("is a no-op without a request and isolates concurrent request contexts", async () => {
    const absent = createRequestPhaseTracker(() => { throw new Error("must not sample"); });
    absent.enter("hunt.prepare");
    absent.finish();
    const a = profile(), b = profile();
    await Promise.all([a, b].map((p, index) => runWithRequestProfile(p, async () => {
      let now = BigInt(0);
      const tracker = createRequestPhaseTracker(() => now);
      tracker.enter("hunt.battle");
      await Promise.resolve();
      now = BigInt(index + 1) * BigInt(1_000_000);
      tracker.finish();
    })));
    expect(a.phases?.["hunt.battle"]?.totalMs).toBe(1);
    expect(b.phases?.["hunt.battle"]?.totalMs).toBe(2);
  });
});
