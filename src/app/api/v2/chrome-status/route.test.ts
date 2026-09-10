import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureUser: vi.fn(),
  readChromeStatus: vi.fn(),
}));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: mocks.ensureUser,
}));

vi.mock("@/lib/server/chromeStatus", () => ({
  readChromeStatus: mocks.readChromeStatus,
}));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ensureUser.mockResolvedValue("u1");
  mocks.readChromeStatus.mockResolvedValue({
    notificationUnread: 3,
    mailUnread: 2,
    hasUnreadNotice: true,
  });
});

describe("GET /api/v2/chrome-status", () => {
  it("미인증 요청을 거부한다", async () => {
    mocks.ensureUser.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mocks.readChromeStatus).not.toHaveBeenCalled();
  });

  it("상단 상태를 private no-store 응답으로 반환한다", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      notificationUnread: 3,
      mailUnread: 2,
      hasUnreadNotice: true,
    });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.readChromeStatus).toHaveBeenCalledWith("u1");
  });
});
