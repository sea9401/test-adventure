import "server-only";
import { performance } from "node:perf_hooks";
import { setImmediate as yieldToEventLoop } from "node:timers/promises";

const COMPUTE_SLICE_MS = 8;

/**
 * Call between sequential work items and await any returned promise. A resolved
 * promise alone would keep draining microtasks instead of letting I/O progress.
 * One item can exceed the budget; this is not a preemption or timeout mechanism.
 */
export function createCooperativeYield(): () => Promise<void> | undefined {
  let resumedAt = performance.now();
  return () => {
    if (performance.now() - resumedAt < COMPUTE_SLICE_MS) return;
    return yieldToEventLoop().then(() => {
      resumedAt = performance.now();
    });
  };
}

/** Compute rows in order; only return the complete result, never a partial map. */
export async function mapWithCooperativeYield<T, R>(
  rows: readonly T[],
  map: (row: T, index: number) => R,
): Promise<R[]> {
  const checkpoint = createCooperativeYield();
  const result: R[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    if (index > 0) {
      const pause = checkpoint();
      if (pause) await pause;
    }
    result.push(map(rows[index], index));
  }
  return result;
}
