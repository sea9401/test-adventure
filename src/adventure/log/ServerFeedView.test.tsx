// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FeedEntry } from "@/lib/feed-config";
import { ServerFeedView } from "./ServerFeedView";

function setVisibility(value: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

function feedEntry(id: number): FeedEntry {
  return {
    id,
    type: "newcomer",
    actorName: `모험가${id}`,
    payload: { newcomer: true },
    createdAt: Date.UTC(2026, 8, 10),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  setVisibility("visible");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("ServerFeedView polling", () => {
  it("같은 최신 피드가 이어지면 30초에서 60초로 늦추고 새 피드에서 복귀한다", async () => {
    const fetcher = vi.fn(async () => {
      const entries = fetcher.mock.calls.length === 4 ? [feedEntry(2)] : [feedEntry(1)];
      return Response.json({ entries, hasMore: false });
    });
    vi.stubGlobal("fetch", fetcher);
    render(<ServerFeedView />);

    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(fetcher).toHaveBeenCalledTimes(1);

    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(fetcher).toHaveBeenCalledTimes(3);

    await act(async () => vi.advanceTimersByTimeAsync(59_999));
    expect(fetcher).toHaveBeenCalledTimes(3);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(fetcher).toHaveBeenCalledTimes(4);

    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(fetcher).toHaveBeenCalledTimes(5);
  });

  it("hidden 동안 멈추고 visible 복귀 시 즉시 최신화한다", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ entries: [feedEntry(1)], hasMore: false }),
    );
    vi.stubGlobal("fetch", fetcher);
    render(<ServerFeedView />);
    await act(async () => vi.advanceTimersByTimeAsync(0));

    act(() => setVisibility("hidden"));
    await act(async () => vi.advanceTimersByTimeAsync(10 * 60_000));
    expect(fetcher).toHaveBeenCalledTimes(1);

    act(() => setVisibility("visible"));
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("과거 페이지는 한 번 불러온 뒤 자동 폴링하지 않는다", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      return Response.json(
        url.includes("before=10")
          ? { entries: [feedEntry(9)], hasMore: false }
          : { entries: [feedEntry(10)], hasMore: true },
      );
    });
    vi.stubGlobal("fetch", fetcher);
    render(<ServerFeedView />);
    await act(async () => vi.advanceTimersByTimeAsync(0));

    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1]?.[0]).toContain("before=10");

    await act(async () => vi.advanceTimersByTimeAsync(10 * 60_000));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
