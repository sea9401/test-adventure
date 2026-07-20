import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureUser: vi.fn<() => Promise<string | null>>(),
  rateLimit: vi.fn(() => null as Response | null),
  lockSave: vi.fn(),
  readSave: vi.fn(),
  upsertSave: vi.fn(),
  deleteImage: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: object) => unknown) => callback({})),
  },
}));
vi.mock("@/lib/server/ensureUser", () => ({ ensureUser: mocks.ensureUser }));
vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: mocks.rateLimit,
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: mocks.lockSave,
  readSave: mocks.readSave,
  upsertSave: mocks.upsertSave,
}));
vi.mock("@/lib/server/profileImageStorage", () => ({
  isProfileImageStorageConfigured: vi.fn(() => true),
  deleteProfileImage: mocks.deleteImage,
}));

import { POST } from "@/app/api/profile/avatar/route";

function request(avatar: string): Request {
  return new Request("http://test/api/profile/avatar", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ avatar }),
  });
}

describe("POST /api/profile/avatar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureUser.mockResolvedValue("123e4567-e89b-42d3-a456-426614174000");
    mocks.lockSave.mockImplementation(async (_tx, _uid, key: string) =>
      key === "character.v2"
        ? { level: 10, cashItems: { profile_image_permit: 2 } }
        : { name: "모험가", gender: "male1" },
    );
  });

  it("성공한 변경에만 변경권 한 개를 소모하고 프로필을 갱신한다", async () => {
    const response = await POST(request("npc:village_blacksmith_bold"));
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      avatar: "npc:village_blacksmith_bold",
      permits: 1,
    });
    expect(mocks.upsertSave).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      "123e4567-e89b-42d3-a456-426614174000",
      "character.v2",
      { level: 10, cashItems: { profile_image_permit: 1 } },
    );
    expect(mocks.upsertSave).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      "123e4567-e89b-42d3-a456-426614174000",
      "character-profile.v2",
      { name: "모험가", gender: "npc:village_blacksmith_bold" },
    );
  });

  it("변경권이 없으면 프로필을 쓰지 않는다", async () => {
    mocks.lockSave.mockImplementation(async (_tx, _uid, key: string) =>
      key === "character.v2"
        ? { cashItems: {} }
        : { name: "모험가", gender: "male1" },
    );

    const response = await POST(request("female1"));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "permit_not_owned",
    });
    expect(mocks.upsertSave).not.toHaveBeenCalled();
  });
});
