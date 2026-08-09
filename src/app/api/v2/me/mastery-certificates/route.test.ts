import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureUser: vi.fn(),
  readStatus: vi.fn(),
  settleMasteryTowerRollover: vi.fn(),
}));

vi.mock("@/db", () => ({ db: { marker: "db" } }));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: mocks.ensureUser,
}));
vi.mock("@/lib/server/masteryCertificateStatus", () => ({
  readMasteryCertificateStatus: mocks.readStatus,
}));
vi.mock("@/lib/server/masteryTowerRollover", () => ({
  settleMasteryTowerRollover: mocks.settleMasteryTowerRollover,
}));

import { GET } from "./route";

describe("GET /api/v2/me/mastery-certificates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureUser.mockResolvedValue("u-test");
    mocks.readStatus.mockResolvedValue({
      certificates: 37,
      jobs: [{ id: "warrior", name: "전사", tier: 1, group: "warrior", mastery: 20 }],
    });
  });

  it("숙련의 탑 정산 없이 증서 상태를 반환한다", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      certificates: 37,
      jobs: [{ id: "warrior", name: "전사", tier: 1, group: "warrior", mastery: 20 }],
    });
    expect(mocks.readStatus).toHaveBeenCalledWith(
      expect.objectContaining({ marker: "db" }),
      "u-test",
    );
    expect(mocks.settleMasteryTowerRollover).not.toHaveBeenCalled();
  });

  it("로그인하지 않은 요청은 거부한다", async () => {
    mocks.ensureUser.mockResolvedValueOnce(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, error: "unauthorized" });
    expect(mocks.readStatus).not.toHaveBeenCalled();
  });
});
