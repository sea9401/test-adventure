import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => { vi.useFakeTimers(); vi.resetModules(); });
afterEach(() => { vi.useRealTimers(); });

describe("presence build version sharing", () => {
  it("joins a heartbeat and expires the successful result after 30 seconds", async () => {
    const { trackPresenceBuildVersion, readPresenceBuildVersion } = await import("./presenceBuildVersion");
    expect(await readPresenceBuildVersion()).toBeNull();
    let resolve!: (id: string | null) => void;
    trackPresenceBuildVersion(new Promise((done) => { resolve = done; }));
    const read = readPresenceBuildVersion();
    resolve("build-one");
    expect(await read).toBe("build-one");
    await vi.advanceTimersByTimeAsync(29_999);
    expect(await readPresenceBuildVersion()).toBe("build-one");
    await vi.advanceTimersByTimeAsync(1);
    expect(await readPresenceBuildVersion()).toBeNull();
  });

  it("returns no version for failed or legacy heartbeats instead of extending an old result", async () => {
    const { trackPresenceBuildVersion, readPresenceBuildVersion } = await import("./presenceBuildVersion");
    trackPresenceBuildVersion(Promise.resolve("old"));
    expect(await readPresenceBuildVersion()).toBe("old");
    trackPresenceBuildVersion(Promise.reject(new Error("offline")));
    expect(await readPresenceBuildVersion()).toBeNull();
    trackPresenceBuildVersion(Promise.resolve(null));
    expect(await readPresenceBuildVersion()).toBeNull();
  });

  it("does not let an obsolete heartbeat replace a newer result", async () => {
    const { trackPresenceBuildVersion, readPresenceBuildVersion } = await import("./presenceBuildVersion");
    let resolve!: (id: string | null) => void;
    trackPresenceBuildVersion(new Promise((done) => { resolve = done; }));
    trackPresenceBuildVersion(Promise.resolve("new"));
    expect(await readPresenceBuildVersion()).toBe("new");
    resolve("old");
    await Promise.resolve();
    expect(await readPresenceBuildVersion()).toBe("new");
  });
});
