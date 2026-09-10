// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ChromeStatusProvider,
  useChromeStatus,
} from "./ChromeStatusProvider";

function StatusProbe() {
  const status = useChromeStatus();
  return (
    <output>
      {status?.notificationUnread}:{status?.mailUnread}:
      {String(status?.hasUnreadNotice)}
    </output>
  );
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("ChromeStatusProvider", () => {
  function renderStatus() {
    return render(
      <ChromeStatusProvider>
        <StatusProbe />
      </ChromeStatusProvider>,
    );
  }

  function statusResponse(notificationUnread = 0) {
    return Response.json({
      ok: true,
      notificationUnread,
      mailUnread: 0,
      hasUnreadNotice: false,
    });
  }

  async function advance(ms: number) {
    await act(async () => vi.advanceTimersByTimeAsync(ms));
  }

  it("같은 상태가 두 번 이어지면 조회를 줄이고 변경 응답 후 기본 주기로 돌아간다", async () => {
    vi.useFakeTimers();
    let unread = 0;
    const fetchMock = vi.fn(async () => statusResponse(unread));
    vi.stubGlobal("fetch", fetchMock);
    renderStatus();
    await flush();
    await advance(120_000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    unread = 2;
    await advance(119_999);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(screen.getByText("0:0:false")).not.toBeNull();
    await advance(1);
    expect(screen.getByText("2:0:false")).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(4);
    await advance(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("hidden에서 마운트하면 복귀할 때까지 최초 요청도 보내지 않는다", async () => {
    vi.useFakeTimers();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    const fetchMock = vi.fn(async () => statusResponse(3));
    vi.stubGlobal("fetch", fetchMock);
    renderStatus();
    window.dispatchEvent(new Event("v2inbox:refresh"));
    await advance(180_000);
    expect(fetchMock).not.toHaveBeenCalled();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText("3:0:false")).not.toBeNull();
  });

  it.each(["v2notif:read", "v2inbox:refresh", "bulletin:read"])(
    "%s 이벤트가 즉시 갱신하고 다음 조회를 60초 뒤로 다시 예약한다",
    async (eventName) => {
      vi.useFakeTimers();
      const fetchMock = vi.fn(async () => statusResponse());
      vi.stubGlobal("fetch", fetchMock);
      renderStatus();
      await flush();
      await advance(230_000);
      expect(fetchMock).toHaveBeenCalledTimes(3);
      window.dispatchEvent(new Event(eventName));
      await flush();
      expect(fetchMock).toHaveBeenCalledTimes(4);
      await advance(59_999);
      expect(fetchMock).toHaveBeenCalledTimes(4);
      await advance(1);
      expect(fetchMock).toHaveBeenCalledTimes(5);
    },
  );

  it("실패해도 표시 상태와 완화한 간격을 유지하고 다음 성공에 회복한다", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => statusResponse(4));
    vi.stubGlobal("fetch", fetchMock);
    renderStatus();
    await flush();
    await advance(120_000);
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
    await advance(120_000);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(screen.getByText("4:0:false")).not.toBeNull();
    await advance(119_999);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    fetchMock.mockResolvedValueOnce(statusResponse(6));
    await advance(1);
    expect(screen.getByText("6:0:false")).not.toBeNull();
  });

  it("느린 요청 중 이벤트와 복귀가 겹쳐도 한 건만 실행하고 unmount 뒤 중단한다", async () => {
    vi.useFakeTimers();
    let resolve!: (value: Response) => void;
    const fetchMock = vi.fn(
      () => new Promise<Response>((done) => { resolve = done; }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { unmount } = renderStatus();
    await advance(60_000);
    window.dispatchEvent(new Event("v2notif:read"));
    document.dispatchEvent(new Event("visibilitychange"));
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    unmount();
    resolve(statusResponse(1));
    await flush();
    window.dispatchEvent(new Event("v2inbox:refresh"));
    document.dispatchEvent(new Event("visibilitychange"));
    await advance(300_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("알림·우편·공지 상태를 단일 요청으로 공급한다", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) =>
      Response.json({
        ok: true,
        notificationUnread: 4,
        mailUnread: 3,
        hasUnreadNotice: true,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ChromeStatusProvider>
        <StatusProbe />
      </ChromeStatusProvider>,
    );

    expect(await screen.findByText("4:3:true")).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/v2/chrome-status", {
      cache: "no-store",
    });
  });

  it("visible에서만 60초 폴링하고 다시 보이면 즉시 갱신한다", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) =>
      Response.json({
        ok: true,
        notificationUnread: 0,
        mailUnread: 0,
        hasUnreadNotice: false,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ChromeStatusProvider>
        <StatusProbe />
      </ChromeStatusProvider>,
    );
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(fetchMock).toHaveBeenCalledTimes(2);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    await act(async () => vi.advanceTimersByTimeAsync(120_000));
    expect(fetchMock).toHaveBeenCalledTimes(2);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each(["v2notif:read", "v2inbox:refresh", "bulletin:read"])(
    "%s 이벤트를 통합 상태 요청으로 처리한다",
    async (eventName) => {
      const fetchMock = vi.fn(async (_input: RequestInfo | URL) =>
        Response.json({
          ok: true,
          notificationUnread: 0,
          mailUnread: 0,
          hasUnreadNotice: false,
        }),
      );
      vi.stubGlobal("fetch", fetchMock);

      render(
        <ChromeStatusProvider>
          <StatusProbe />
        </ChromeStatusProvider>,
      );
      await flush();

      window.dispatchEvent(new Event(eventName));
      await flush();

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls.at(-1)?.[0]).toBe("/api/v2/chrome-status");
    },
  );
});
