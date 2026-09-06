import { describe, expect, it, vi } from "vitest";
import { createStateRefreshCoordinator } from "./stateRefreshCoordinator";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe("state refresh coordinator", () => {
  it("coalesces same-tick refreshes without caching completed responses", async () => {
    const read = vi.fn(async () => 1), apply = vi.fn();
    const coordinator = createStateRefreshCoordinator(read, apply);
    await Promise.all(Array.from({ length: 10 }, () => coordinator.refresh()));
    expect(read).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledTimes(1);
    await coordinator.refresh();
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("ignores an outdated in-flight result and drains one fresh trailing read", async () => {
    const old = deferred<number>();
    const read = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce(2);
    const apply = vi.fn();
    const coordinator = createStateRefreshCoordinator<number>(read, apply);
    const first = coordinator.refresh();
    await Promise.resolve();
    const rest = Array.from({ length: 10 }, () => coordinator.refresh());
    old.resolve(1);
    await Promise.all([first, ...rest]);
    expect(read).toHaveBeenCalledTimes(2);
    expect(apply.mock.calls).toEqual([[2]]);
  });

  it("retries a superseded error, but propagates current errors and permits recovery", async () => {
    const old = deferred<number>();
    const read = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce(2);
    const coordinator = createStateRefreshCoordinator<number>(read, vi.fn());
    const first = coordinator.refresh();
    await Promise.resolve();
    const next = coordinator.refresh();
    old.reject(new Error("old"));
    await Promise.all([first, next]);
    read.mockRejectedValueOnce(new Error("current"));
    await expect(coordinator.refresh()).rejects.toThrow("current");
    read.mockResolvedValueOnce(3);
    await expect(coordinator.refresh()).resolves.toBeUndefined();
  });

  it("invalidates pending work without issuing a trailing request on disposal", async () => {
    const pending = deferred<number>();
    const read = vi.fn(() => pending.promise), apply = vi.fn();
    const coordinator = createStateRefreshCoordinator(read, apply);
    const first = coordinator.refresh();
    await Promise.resolve();
    coordinator.refresh();
    coordinator.invalidate();
    pending.resolve(1);
    await first;
    expect(apply).not.toHaveBeenCalled();
    expect(read).toHaveBeenCalledTimes(1);
  });
});
