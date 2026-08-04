import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userId: "u-preview" as string | null,
  preview: vi.fn(() => ({
    ok: true as const,
    currentPower: 1234,
    candidatePower: 1288,
    delta: 54,
  })),
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: () => ({
        where: async () => [
          { key: "character.v2", value: { level: 50 } },
          { key: "equipment.v2", value: { owned: [], equipped: {} } },
        ],
      }),
    })),
  },
}));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => mocks.userId),
}));
vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: vi.fn(() => null),
}));
vi.mock("@/lib/server/equipmentPowerPreview", () => ({
  previewEquipmentPowerFromSaves: mocks.preview,
}));

import { POST } from "./route";

function request(body: unknown) {
  return new Request(
    "http://localhost/api/v2/me/equipment/power-preview",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.userId = "u-preview";
  mocks.preview.mockReturnValue({
    ok: true,
    currentPower: 1234,
    candidatePower: 1288,
    delta: 54,
  });
});

describe("POST /api/v2/me/equipment/power-preview", () => {
  it("보유 장비 iid의 전투력 미리보기를 반환한다", async () => {
    const response = await POST(request({ iid: "eq-candidate" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      currentPower: 1234,
      candidatePower: 1288,
      delta: 54,
    });
    expect(mocks.preview).toHaveBeenCalledWith(
      expect.objectContaining({ candidate: { iid: "eq-candidate" } }),
    );
  });

  it("거래소 후보 스냅샷을 미리보기 계산에 전달한다", async () => {
    const candidate = {
      itemId: "v2_greatsword",
      roll: { power: 30, weight: 0 },
    };
    const response = await POST(request({ candidate }));

    expect(response.status).toBe(200);
    expect(mocks.preview).toHaveBeenCalledWith(
      expect.objectContaining({ candidate }),
    );
  });

  it("후보가 없거나 로그인하지 않은 요청을 거부한다", async () => {
    const invalid = await POST(request({}));
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error).toBe("bad_candidate");

    mocks.userId = null;
    const unauthorized = await POST(request({ iid: "eq-candidate" }));
    expect(unauthorized.status).toBe(401);
  });
});
