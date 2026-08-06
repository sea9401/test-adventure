import { afterEach, describe, expect, it, vi } from "vitest";
import { acknowledgeFarmReadyNotification } from "./farmReadyNotificationClient";

describe("acknowledgeFarmReadyNotification", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("확인 저장 성공 여부를 호출자에게 돌려주고 알림 수를 갱신한다", async () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", { dispatchEvent });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true })),
    );

    await expect(acknowledgeFarmReadyNotification()).resolves.toBe(true);
    expect(dispatchEvent).toHaveBeenCalledOnce();
  });

  it("확인 저장 실패 시 읽은 것으로 오인하지 않는다", async () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", { dispatchEvent });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false })),
    );

    await expect(acknowledgeFarmReadyNotification()).resolves.toBe(false);
    expect(dispatchEvent).not.toHaveBeenCalled();
  });
});
