import { describe, expect, it, vi } from "vitest";
import { createMarketplaceReadCoordinator } from "./marketplaceReadCoordinator";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe("marketplace read coordination", () => {
  it("shares concurrent reads but does not cache completed results", async () => {
    const coordinator = createMarketplaceReadCoordinator();
    const pending = deferred<number>();
    const read = vi.fn(() => pending.promise);
    const apply = vi.fn();
    const first = coordinator.run("browse", read, apply);
    const second = coordinator.run("browse", read, apply);
    pending.resolve(1);
    await Promise.all([first, second]);
    expect(read).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledTimes(1);
    await coordinator.run("browse", read, apply);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("invalidates old responses and starts a fresh read after a mutation", async () => {
    const coordinator = createMarketplaceReadCoordinator();
    const old = deferred<number>();
    const apply = vi.fn();
    const first = coordinator.run("browse", () => old.promise, apply);
    coordinator.invalidate();
    await coordinator.run("browse", async () => 2, apply);
    old.resolve(1);
    await first;
    expect(apply.mock.calls).toEqual([[2]]);
  });

  it("ignores stale failures, preserves current failures, and allows retry", async () => {
    const coordinator = createMarketplaceReadCoordinator();
    const old = deferred<number>();
    const first = coordinator.run("browse", () => old.promise, vi.fn());
    coordinator.invalidate();
    old.reject(new Error("stale"));
    await expect(first).resolves.toBeUndefined();
    await expect(coordinator.run("browse", async () => { throw new Error("current"); }, vi.fn())).rejects.toThrow("current");
    const apply = vi.fn();
    await coordinator.run("browse", async () => 3, apply);
    expect(apply).toHaveBeenCalledWith(3);
  });

  it("keeps keys and component instances independent", async () => {
    const a = createMarketplaceReadCoordinator();
    const b = createMarketplaceReadCoordinator();
    const apply = vi.fn();
    await Promise.all([
      a.run("browse", async () => 1, apply),
      a.run("mine", async () => 2, apply),
      b.run("browse", async () => 3, apply),
    ]);
    expect(apply).toHaveBeenCalledTimes(3);
  });
});
