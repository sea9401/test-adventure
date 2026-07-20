import { beforeEach, describe, expect, it, vi } from "vitest";

const EMBLEM_KEY =
  "guild-emblems/7/123e4567-e89b-42d3-a456-426614174000.webp";

const mocks = vi.hoisted(() => ({
  ensureUser: vi.fn<() => Promise<string | null>>(),
  rateLimit: vi.fn(() => null as Response | null),
  processImage: vi.fn(),
  storageConfigured: vi.fn(() => true),
  uploadImage: vi.fn(),
  deleteImage: vi.fn(),
  lockSave: vi.fn(),
  upsertSave: vi.fn(),
  logActivity: vi.fn(),
  memberRows: [] as Array<Record<string, unknown>>,
  guildRows: [] as Array<Record<string, unknown>>,
  updatedGuild: null as Record<string, unknown> | null,
}));

vi.mock("@/lib/server/ensureUser", () => ({ ensureUser: mocks.ensureUser }));
vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: mocks.rateLimit,
}));
vi.mock("@/lib/server/guildEmblemImage", () => ({
  processGuildEmblemImage: mocks.processImage,
}));
vi.mock("@/lib/server/guildEmblemStorage", () => ({
  isGuildEmblemStorageConfigured: mocks.storageConfigured,
  uploadGuildEmblemImage: mocks.uploadImage,
  deleteGuildEmblemImage: mocks.deleteImage,
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: mocks.lockSave,
  upsertSave: mocks.upsertSave,
}));
vi.mock("@/lib/server/guildActivityLog", () => ({
  logGuildActivity: mocks.logActivity,
}));

vi.mock("@/db", async () => {
  const schema = await import("@/db/schema");
  function chain(rows: Array<Record<string, unknown>>) {
    const value = {
      where: () => value,
      for: () => value,
      limit: () => value,
      then: (
        resolve: (result: Array<Record<string, unknown>>) => unknown,
        reject?: (error: unknown) => unknown,
      ) => Promise.resolve(rows).then(resolve, reject),
    };
    return value;
  }
  const select = () => ({
    from: (table: unknown) =>
      chain(table === schema.guildMembers ? mocks.memberRows : mocks.guildRows),
  });
  const tx = {
    select,
    update: () => ({
      set: (values: Record<string, unknown>) => {
        mocks.updatedGuild = values;
        return { where: async () => undefined };
      },
    }),
  };
  return {
    db: {
      select,
      transaction: vi.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)),
    },
  };
});

import { GUILD_CUSTOM_EMBLEM_COIN_COST } from "@/adventure/data/guild-emblems";
import { DELETE, POST, PUT } from "@/app/api/v2/guild/emblem/route";

function uploadRequest(): Request {
  const form = new FormData();
  form.set("image", new File(["mock"], "emblem.png", { type: "image/png" }));
  return new Request("http://test/api/v2/guild/emblem", {
    method: "POST",
    body: form,
  });
}

function deleteRequest(): Request {
  return new Request("http://test/api/v2/guild/emblem", { method: "DELETE" });
}

function gameImageRequest(): Request {
  return new Request("http://test/api/v2/guild/emblem", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ avatar: "male1" }),
  });
}

describe("/api/v2/guild/emblem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureUser.mockResolvedValue("u-master");
    mocks.storageConfigured.mockReturnValue(true);
    mocks.processImage.mockResolvedValue({
      ok: true,
      bytes: new Uint8Array([1, 2, 3]),
    });
    mocks.uploadImage.mockResolvedValue(EMBLEM_KEY);
    mocks.deleteImage.mockResolvedValue(undefined);
    mocks.lockSave.mockResolvedValue({ coins: 2_000 });
    mocks.memberRows = [{ guildId: 7 }];
    mocks.guildRows = [{ masterId: "u-master", emblem: null }];
    mocks.updatedGuild = null;
  });

  it("파일을 R2에 저장하고 길드장의 개인 무슨 코인을 차감한다", async () => {
    const response = await POST(uploadRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      emblem: EMBLEM_KEY,
      cost: GUILD_CUSTOM_EMBLEM_COIN_COST,
      coins: 1_500,
    });
    expect(mocks.uploadImage).toHaveBeenCalledWith({
      guildId: 7,
      bytes: new Uint8Array([1, 2, 3]),
    });
    expect(mocks.upsertSave).toHaveBeenCalledWith(
      expect.anything(),
      "u-master",
      "museun-coin-wallet.v1",
      {
        coins: 1_500,
      },
    );
    expect(mocks.updatedGuild).toEqual({ emblem: EMBLEM_KEY });
  });

  it("개인 무슨 코인이 부족하면 새 R2 객체를 지우고 DB를 변경하지 않는다", async () => {
    mocks.lockSave.mockResolvedValue({ coins: 499 });

    const response = await POST(uploadRequest());
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "insufficient_coins",
    });
    expect(mocks.deleteImage).toHaveBeenCalledWith(EMBLEM_KEY);
    expect(mocks.updatedGuild).toBeNull();
  });

  it("교체가 완료되면 이전 R2 객체를 지운다", async () => {
    const oldKey =
      "guild-emblems/7/123e4567-e89b-42d3-b456-426614174000.webp";
    mocks.guildRows = [{ masterId: "u-master", emblem: oldKey }];

    const response = await POST(uploadRequest());
    expect(response.status).toBe(200);
    expect(mocks.deleteImage).toHaveBeenCalledWith(oldKey);
  });

  it("엠블럼 제거는 무료이며 이전 R2 객체를 지운다", async () => {
    mocks.guildRows = [{ masterId: "u-master", emblem: EMBLEM_KEY }];

    const response = await DELETE(deleteRequest());
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      emblem: null,
      cost: 0,
    });
    expect(mocks.lockSave).not.toHaveBeenCalled();
    expect(mocks.updatedGuild).toEqual({ emblem: null });
    expect(mocks.deleteImage).toHaveBeenCalledWith(EMBLEM_KEY);
  });

  it("게임 내 이미지는 무슨 코인을 쓰지 않고 적용한다", async () => {
    mocks.guildRows = [{ masterId: "u-master", emblem: EMBLEM_KEY }];

    const response = await PUT(gameImageRequest());
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      emblem: "game-avatar:male1",
      cost: 0,
    });
    expect(mocks.lockSave).not.toHaveBeenCalled();
    expect(mocks.upsertSave).not.toHaveBeenCalled();
    expect(mocks.updatedGuild).toEqual({ emblem: "game-avatar:male1" });
    expect(mocks.deleteImage).toHaveBeenCalledWith(EMBLEM_KEY);
  });

  it("올바르지 않은 파일은 R2 업로드 전에 거부한다", async () => {
    mocks.processImage.mockResolvedValue({ ok: false, error: "not_image" });

    const response = await POST(uploadRequest());
    expect(response.status).toBe(400);
    expect(mocks.uploadImage).not.toHaveBeenCalled();
    expect(mocks.updatedGuild).toBeNull();
  });

  it("길드 마스터가 아니면 파일 처리도 시작하지 않는다", async () => {
    mocks.guildRows = [{ masterId: "u-other", emblem: null }];

    const response = await POST(uploadRequest());
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "not_master",
    });
    expect(mocks.processImage).not.toHaveBeenCalled();
    expect(mocks.uploadImage).not.toHaveBeenCalled();
  });

  it("R2 환경 설정이 없으면 명확한 503을 반환한다", async () => {
    mocks.storageConfigured.mockReturnValue(false);

    const response = await POST(uploadRequest());
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "storage_unavailable",
    });
    expect(mocks.processImage).not.toHaveBeenCalled();
  });
});
