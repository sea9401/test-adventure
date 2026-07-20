import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-21T00:00:00.000Z"));
    mocks.ensureUser.mockResolvedValue("123e4567-e89b-42d3-a456-426614174000");
    mocks.lockSave.mockImplementation(async (_tx, _uid, key: string) =>
      key === "character.v2"
        ? { level: 10, cashItems: { profile_image_permit: 2 } }
        : { name: "모험가", gender: "male1" },
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("변경권을 소모하지 않고 프로필을 갱신한 뒤 24시간 쿨타임을 저장한다", async () => {
    const response = await POST(request("npc:village_blacksmith_bold"));
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      avatar: "npc:village_blacksmith_bold",
      permits: 2,
      gameAvatarCooldownUntil: Date.now() + 24 * 60 * 60 * 1_000,
    });
    expect(mocks.upsertSave).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      "123e4567-e89b-42d3-a456-426614174000",
      "character.v2",
      {
        level: 10,
        cashItems: { profile_image_permit: 2 },
        lastGameProfileImageChangeAt: Date.now(),
      },
    );
    expect(mocks.upsertSave).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      "123e4567-e89b-42d3-a456-426614174000",
      "character-profile.v2",
      { name: "모험가", gender: "npc:village_blacksmith_bold" },
    );
  });

  it("변경권이 없어도 게임 내 이미지로 변경할 수 있다", async () => {
    mocks.lockSave.mockImplementation(async (_tx, _uid, key: string) =>
      key === "character.v2"
        ? { cashItems: {} }
        : { name: "모험가", gender: "male1" },
    );

    const response = await POST(request("female1"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      avatar: "female1",
      permits: 0,
    });
    expect(mocks.upsertSave).toHaveBeenCalledTimes(2);
  });

  it("마지막 게임 이미지 변경 후 24시간 안에는 변경을 거절한다", async () => {
    mocks.lockSave.mockImplementation(async (_tx, _uid, key: string) =>
      key === "character.v2"
        ? {
            cashItems: { profile_image_permit: 3 },
            lastGameProfileImageChangeAt: Date.now() - 60 * 60 * 1_000,
          }
        : { name: "모험가", gender: "male1" },
    );

    const response = await POST(request("female1"));
    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "game_avatar_cooldown",
      gameAvatarCooldownUntil: Date.now() + 23 * 60 * 60 * 1_000,
    });
    expect(mocks.upsertSave).not.toHaveBeenCalled();
  });

  it("마지막 변경에서 정확히 24시간이 지나면 다시 변경할 수 있다", async () => {
    mocks.lockSave.mockImplementation(async (_tx, _uid, key: string) =>
      key === "character.v2"
        ? {
            cashItems: {},
            lastGameProfileImageChangeAt:
              Date.now() - 24 * 60 * 60 * 1_000,
          }
        : { name: "모험가", gender: "male1" },
    );

    const response = await POST(request("female1"));
    expect(response.status).toBe(200);
    expect(mocks.upsertSave).toHaveBeenCalledTimes(2);
  });
});
