import { afterEach, describe, expect, it, vi } from "vitest";
import { acknowledgeV2Notification } from "./notificationReadClient";

describe("acknowledgeV2Notification", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("이동 중에도 지정한 알림 한 건의 읽음 처리를 유지한다", async () => {
    const dispatchEvent = vi.fn();
    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal("window", { dispatchEvent });
    vi.stubGlobal("fetch", fetchMock);

    await expect(acknowledgeV2Notification(37)).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v2/notifications/read",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ notificationId: 37 }),
        keepalive: true,
      }),
    );
    expect(dispatchEvent).toHaveBeenCalledOnce();
  });

  it("읽음 처리 실패가 화면 이동 호출자를 막지 않도록 false를 반환한다", async () => {
    vi.stubGlobal("window", { dispatchEvent: vi.fn() });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false })),
    );

    await expect(acknowledgeV2Notification(37)).resolves.toBe(false);
  });
});
