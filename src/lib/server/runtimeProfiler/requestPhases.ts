import { currentRequestProfile } from "./requestContext";
import type { RequestPhase } from "./types";

/** Sequential request-local phases. No user input, SQL text or identifiers are retained. */
export function createRequestPhaseTracker(nowNs = process.hrtime.bigint) {
  const profile = currentRequestProfile();
  let current: { name: RequestPhase; started: bigint; queries: number; dbMs: number } | undefined;
  const finish = (failed = false) => {
    if (!profile || !current) return;
    const { name, started, queries, dbMs } = current;
    current = undefined;
    const elapsed = Math.max(0, Number(nowNs() - started) / 1_000_000);
    const metrics = (profile.phases ??= {})[name] ??= {
      count: 0, failed: 0, totalMs: 0, maxMs: 0, dbQueries: 0, dbMs: 0,
    };
    metrics.count += 1;
    metrics.failed += failed ? 1 : 0;
    metrics.totalMs += elapsed;
    metrics.maxMs = Math.max(metrics.maxMs, elapsed);
    metrics.dbQueries += Math.max(0, profile.database.queryCount - queries);
    metrics.dbMs += Math.max(0, profile.database.totalDurationMs - dbMs);
  };
  return {
    enter(name: RequestPhase) {
      if (!profile) return;
      finish();
      current = { name, started: nowNs(), queries: profile.database.queryCount, dbMs: profile.database.totalDurationMs };
    },
    finish,
  };
}
