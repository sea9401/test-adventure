// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startAdaptiveVisiblePolling } from "./adaptiveVisiblePolling";

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
  setVisibility("visible");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("startAdaptiveVisiblePolling", () => {
  it("완료된 응답의 idle 횟수로 다음 요청을 예약하고 변화 시 기본 간격으로 돌아간다", async () => {
    const outcomes = [
      "changed",
      "unchanged",
      "unchanged",
      "changed",
      "unchanged",
    ] as const;
    const task = vi.fn(async () => outcomes[task.mock.calls.length - 1]);
    const stop = startAdaptiveVisiblePolling({
      task,
      delayMs: (idle) => (idle >= 2 ? 60_000 : 30_000),
      runImmediately: true,
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(task).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(30_000);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(task).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(59_999);
    expect(task).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(task).toHaveBeenCalledTimes(4);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(task).toHaveBeenCalledTimes(5);
    stop();
  });

  it("hidden에서는 예약을 멈추고 visible 복귀 때 즉시 한 번 실행한다", async () => {
    const task = vi.fn(async () => "unchanged" as const);
    const stop = startAdaptiveVisiblePolling({
      task,
      delayMs: () => 10_000,
      runImmediately: false,
    });

    setVisibility("hidden");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(task).not.toHaveBeenCalled();

    setVisibility("visible");
    await vi.advanceTimersByTimeAsync(0);
    expect(task).toHaveBeenCalledTimes(1);
    stop();
  });

  it("진행 중인 요청에는 visibility와 focus 요청을 겹치지 않는다", async () => {
    const pending = deferred<"unchanged">();
    const task = vi.fn(() => pending.promise);
    const stop = startAdaptiveVisiblePolling({
      task,
      delayMs: () => 30_000,
      runImmediately: true,
      refreshOnFocus: true,
    });

    await vi.advanceTimersByTimeAsync(0);
    setVisibility("visible");
    window.dispatchEvent(new Event("focus"));
    expect(task).toHaveBeenCalledTimes(1);

    pending.resolve("unchanged");
    await pending.promise;
    await vi.advanceTimersByTimeAsync(29_999);
    expect(task).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(task).toHaveBeenCalledTimes(2);
    stop();
  });
});
