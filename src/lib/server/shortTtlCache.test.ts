import { describe, expect, it, vi } from "vitest";
import { ShortTtlCache } from "./shortTtlCache";

describe("ShortTtlCache", () => {
  it("coalesces concurrent loads and reuses the value before expiry", async () => {
    const cache = new ShortTtlCache(1_000);
    const loader = vi.fn(async () => ({ enabled: true }));

    const [first, second] = await Promise.all([
      cache.get("feature", loader, 100),
      cache.get("feature", loader, 100),
    ]);
    const third = await cache.get("feature", loader, 1_099);

    expect(loader).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
    expect(third).toBe(first);
  });

  it("reloads expired and explicitly invalidated entries", async () => {
    const cache = new ShortTtlCache(1_000);
    const loader = vi.fn(async () => loader.mock.calls.length);

    expect(await cache.get("feature", loader, 100)).toBe(1);
    expect(await cache.get("feature", loader, 1_100)).toBe(2);
    cache.invalidate("feature");
    expect(await cache.get("feature", loader, 1_101)).toBe(3);
  });

  it("does not retain rejected loads", async () => {
    const cache = new ShortTtlCache(1_000);
    const loader = vi
      .fn<() => Promise<number>>()
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce(7);

    await expect(cache.get("feature", loader, 100)).rejects.toThrow("temporary");
    await expect(cache.get("feature", loader, 101)).resolves.toBe(7);
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
