import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  readStatus: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  where: vi.fn(),
  returning: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/server/playerSanctions", () => ({
  readPlayerSanctionStatus: mocks.readStatus,
}));
vi.mock("@/db", () => ({
  db: { update: mocks.update },
}));

import { GET, POST } from "@/app/api/v2/me/sanctions/route";

function acknowledgeRequest(warningId: unknown) {
  return new Request("http://test.local/api/v2/me/sanctions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ warningId }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "u-test" } });
  mocks.update.mockReturnValue({ set: mocks.set });
  mocks.set.mockReturnValue({ where: mocks.where });
  mocks.where.mockReturnValue({ returning: mocks.returning });
  mocks.returning.mockResolvedValue([{ id: 7 }]);
});

describe("/api/v2/me/sanctions", () => {
  it("정지와 미확인 경고 상태를 로그인한 이용자에게 반환한다", async () => {
    mocks.readStatus.mockResolvedValue({
      suspension: {
        reason: "자동화 의심 행위 반복",
        expiresAt: "2026-07-17T00:00:00.000Z",
        permanent: false,
      },
      warning: {
        id: 7,
        reason: "비정상 반복 플레이 패턴",
        createdAt: "2026-07-16T00:00:00.000Z",
      },
    });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      suspension: { permanent: false },
      warning: { id: 7 },
    });
    expect(mocks.readStatus).toHaveBeenCalledWith("u-test");
  });

  it("로그인하지 않은 요청은 상태를 노출하지 않는다", async () => {
    mocks.auth.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mocks.readStatus).not.toHaveBeenCalled();
  });

  it("본인의 미확인 경고를 확인 처리한다", async () => {
    const response = await POST(acknowledgeRequest(7));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, warningId: 7 });
    expect(mocks.update).toHaveBeenCalledOnce();
    expect(mocks.set).toHaveBeenCalledWith({ acknowledgedAt: expect.any(Date) });
  });

  it("이미 확인했거나 본인 소유가 아닌 경고는 확인하지 않는다", async () => {
    mocks.returning.mockResolvedValue([]);

    const response = await POST(acknowledgeRequest(7));

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: "warning_not_found" });
  });

  it("올바른 경고 ID만 허용한다", async () => {
    const response = await POST(acknowledgeRequest("7"));

    expect(response.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
