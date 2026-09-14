import { AsyncLocalStorage } from "node:async_hooks";
import { performance } from "node:perf_hooks";
import { setImmediate as nextTurn } from "node:timers/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCooperativeYield, mapWithCooperativeYield } from "./cooperativeYield";

afterEach(() => vi.restoreAllMocks());

describe("cooperative computation", () => {
  it("keeps short work synchronous and yields to an actual event-loop callback at 8ms", async () => {
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const checkpoint = createCooperativeYield();
    now = 7;
    expect(checkpoint()).toBeUndefined();

    let progressed = false;
    const otherWork = nextTurn().then(() => { progressed = true; });
    now = 8;
    const pause = checkpoint();
    expect(pause).toBeInstanceOf(Promise);
    await pause;
    expect(progressed).toBe(true);
    await otherWork;
  });

  it("starts the next budget after resuming, excluding time spent yielding", async () => {
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const checkpoint = createCooperativeYield();
    const otherWork = nextTurn().then(() => { now = 500; });
    now = 8;
    await checkpoint();
    await otherWork;
    expect(checkpoint()).toBeUndefined();
    now = 508;
    const pause = checkpoint();
    expect(pause).toBeInstanceOf(Promise);
    await pause;
  });

  it("retains request context across an event-loop yield", async () => {
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const context = new AsyncLocalStorage<string>();
    await context.run("request-one", async () => {
      const checkpoint = createCooperativeYield();
      now = 8;
      await checkpoint();
      expect(context.getStore()).toBe("request-one");
    });
  });

  it("maps every row in order while unrelated work runs before completion", async () => {
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const visited: number[] = [];
    let visitedAtPulse: number[] = [];
    const pulse = nextTurn().then(() => { visitedAtPulse = [...visited]; });
    const result = await mapWithCooperativeYield([10, 20, 30], (row, index) => {
      visited.push(row);
      now += 8;
      return row + index;
    });
    await pulse;
    expect(visitedAtPulse).toEqual([10]);
    expect(visited).toEqual([10, 20, 30]);
    expect(result).toEqual([10, 21, 32]);
  });

  it("does no work for empty input and propagates computation failures", async () => {
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const emptyMapper = vi.fn();
    expect(await mapWithCooperativeYield([], emptyMapper)).toEqual([]);
    expect(emptyMapper).not.toHaveBeenCalled();
    const visited: number[] = [];
    const failure = new Error("invalid save");
    await expect(mapWithCooperativeYield([1, 2, 3], (row) => {
      visited.push(row);
      now += 8;
      if (row === 2) throw failure;
      return row;
    })).rejects.toBe(failure);
    expect(visited).toEqual([1, 2]);
  });
});
