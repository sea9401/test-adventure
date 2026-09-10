// @vitest-environment jsdom

import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APP_BUILD_VERSION } from "./clientVersion";
import { usePresenceHeartbeat } from "./usePresenceHeartbeat";
import { readPresenceBuildVersion } from "./presenceBuildVersion";

const mocks = vi.hoisted(() => ({
  remote: {
    flushSync: vi.fn(),
    invalidateSession: vi.fn(),
    status: vi.fn(() => ({ kind: "idle" as const })),
    subscribe: vi.fn(() => vi.fn()),
  },
}));

vi.mock("./storage/SaveProvider", () => ({
  useRemoteSave: () => mocks.remote,
}));

function setVisibility(value: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value,
  });
}

function HeartbeatHarness() {
  usePresenceHeartbeat({ name: "모험가", className: "warrior" });
  return null;
}

describe("usePresenceHeartbeat visibility polling", () => {
  const fetchMock = vi.fn(async () =>
    Response.json({ buildVersion: APP_BUILD_VERSION }),
  );

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    setVisibility("visible");
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    setVisibility("visible");
  });

  it("숨겨진 동안 정기 ping을 멈추고 다시 보이면 즉시 동기화한다", async () => {
    render(<HeartbeatHarness />);

    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    setVisibility("hidden");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    setVisibility("visible");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("진행 중 heartbeat를 중복하지 않고 배포 식별자를 버전 검사에 공유한다", async () => {
    let resolve!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    render(<HeartbeatHarness />);
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve(Response.json({ buildVersion: APP_BUILD_VERSION, buildId: "current-build" }));
    });
    expect(await readPresenceBuildVersion()).toBe("current-build");
  });

  it.each([410, 200])("통합 후에도 세션 무효화 응답(%s)을 처리한다", async (status) => {
    fetchMock.mockResolvedValueOnce(Response.json({ sessionInvalidated: true }, { status }));
    render(<HeartbeatHarness />);
    await act(async () => Promise.resolve());
    expect(mocks.remote.invalidateSession).toHaveBeenCalledTimes(1);
    expect(await readPresenceBuildVersion()).toBeNull();
  });
});
