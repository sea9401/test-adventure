// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function setVisibility(value: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("NEXT_PUBLIC_BUILD_ID", "build-loaded");
  vi.resetModules();
  setVisibility("visible");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("VersionCheck", () => {
  it("heartbeat에서 다른 빌드를 받으면 새로고침 안내를 표시한다", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const { trackPresenceBuildVersion } = await import("@/lib/presenceBuildVersion");
    trackPresenceBuildVersion(Promise.resolve("build-new"));
    const { VersionCheck } = await import("./VersionCheck");
    render(<VersionCheck />);
    await act(async () => Promise.resolve());
    expect(screen.getByRole("button", { name: "새로고침" })).not.toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("같은 mount에서 시작한 heartbeat에 합류해 별도 version GET을 생략한다", async () => {
    const fetcher = vi.fn(async () => Response.json({ buildId: "build-loaded" }));
    vi.stubGlobal("fetch", fetcher);
    const { VersionCheck } = await import("./VersionCheck");
    const { trackPresenceBuildVersion } = await import("@/lib/presenceBuildVersion");
    const pending = deferred<string | null>();
    render(<VersionCheck />);
    trackPresenceBuildVersion(pending.promise);
    await act(async () => { pending.resolve("build-loaded"); });
    expect(fetcher).not.toHaveBeenCalled();
    act(() => window.dispatchEvent(new Event("focus")));
    await act(async () => Promise.resolve());
    expect(fetcher).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    act(() => window.dispatchEvent(new Event("focus")));
    await act(async () => Promise.resolve());
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("heartbeat 실패에는 독립 version GET으로 복구한다", async () => {
    const fetcher = vi.fn(async () => Response.json({ buildId: "build-loaded" }));
    vi.stubGlobal("fetch", fetcher);
    const { trackPresenceBuildVersion } = await import("@/lib/presenceBuildVersion");
    trackPresenceBuildVersion(Promise.resolve(null));
    const { VersionCheck } = await import("./VersionCheck");
    render(<VersionCheck />);
    await act(async () => Promise.resolve());
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("hidden 주기는 건너뛰고 visible에서 15분마다 확인한다", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ buildId: "build-loaded" }),
    );
    vi.stubGlobal("fetch", fetcher);
    const { VersionCheck } = await import("./VersionCheck");
    render(<VersionCheck />);

    await act(async () => Promise.resolve());
    expect(fetcher).toHaveBeenCalledTimes(1);

    act(() => setVisibility("hidden"));
    await act(async () => vi.advanceTimersByTimeAsync(30 * 60 * 1_000));
    expect(fetcher).toHaveBeenCalledTimes(1);

    act(() => setVisibility("visible"));
    await act(async () => Promise.resolve());
    expect(fetcher).toHaveBeenCalledTimes(2);

    await act(async () => vi.advanceTimersByTimeAsync(15 * 60 * 1_000 - 1));
    expect(fetcher).toHaveBeenCalledTimes(2);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("mount 확인 중 겹친 visibility와 focus 이벤트를 같은 요청에 합친다", async () => {
    const pending = deferred<Response>();
    const fetcher = vi.fn(() => pending.promise);
    vi.stubGlobal("fetch", fetcher);
    const { VersionCheck } = await import("./VersionCheck");
    render(<VersionCheck />);

    act(() => {
      setVisibility("visible");
      window.dispatchEvent(new Event("focus"));
    });
    await act(async () => Promise.resolve());
    expect(fetcher).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending.resolve(Response.json({ buildId: "build-loaded" }));
      await pending.promise;
    });
  });
});
