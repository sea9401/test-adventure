import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureUser: vi.fn<() => Promise<string | null>>(),
  rateLimit: vi.fn(() => null as Response | null),
  verifyImage: vi.fn(),
  lockResources: vi.fn(),
  upsertResources: vi.fn(),
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
  verifyGuildEmblemImage: mocks.verifyImage,
}));
vi.mock("@/lib/server/v2GuildResources", () => ({
  lockGuildResources: mocks.lockResources,
  upsertGuildResources: mocks.upsertResources,
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
  const tx = {
    select: () => ({
      from: (table: unknown) =>
        chain(table === schema.guildMembers ? mocks.memberRows : mocks.guildRows),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        mocks.updatedGuild = values;
        return { where: async () => undefined };
      },
    }),
  };
  return {
    db: {
      transaction: vi.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)),
    },
  };
});

import { GUILD_EMBLEM_CHANGE_COST } from "@/adventure/data/guild-emblems";
import { POST } from "@/app/api/v2/guild/emblem/route";

const IMAGE_URL = "https://i.imgur.com/bC2okTl.jpg";

function request(emblem: unknown): Request {
  return new Request("http://test/api/v2/guild/emblem", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ emblem }),
  });
}

describe("POST /api/v2/guild/emblem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureUser.mockResolvedValue("u-master");
    mocks.verifyImage.mockResolvedValue({ ok: true, url: IMAGE_URL });
    mocks.lockResources.mockResolvedValue({ gold: 100_000_000 });
    mocks.memberRows = [{ guildId: 7 }];
    mocks.guildRows = [{ masterId: "u-master", emblem: null }];
    mocks.updatedGuild = null;
  });

  it("새 URL 등록 시 길드 자금 5천만 G를 차감하고 엠블럼을 저장한다", async () => {
    const response = await POST(request(IMAGE_URL));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      emblem: IMAGE_URL,
      cost: GUILD_EMBLEM_CHANGE_COST,
      guildGold: 50_000_000,
    });
    expect(mocks.upsertResources).toHaveBeenCalledWith(
      expect.anything(),
      7,
      { gold: 50_000_000 },
    );
    expect(mocks.updatedGuild).toEqual({ emblem: IMAGE_URL });
  });

  it("길드 자금이 부족하면 엠블럼을 변경하지 않는다", async () => {
    mocks.lockResources.mockResolvedValue({ gold: 49_999_999 });

    const response = await POST(request(IMAGE_URL));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "insufficient_gold",
      cost: GUILD_EMBLEM_CHANGE_COST,
      gold: 49_999_999,
    });
    expect(mocks.updatedGuild).toBeNull();
    expect(mocks.upsertResources).not.toHaveBeenCalled();
  });

  it("같은 URL 재저장은 무료 멱등 처리한다", async () => {
    mocks.guildRows = [{ masterId: "u-master", emblem: IMAGE_URL }];

    const response = await POST(request(IMAGE_URL));
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      cost: 0,
      unchanged: true,
    });
    expect(mocks.lockResources).not.toHaveBeenCalled();
    expect(mocks.updatedGuild).toBeNull();
  });

  it("엠블럼 제거는 무료이며 원격 이미지 검사를 하지 않는다", async () => {
    mocks.guildRows = [{ masterId: "u-master", emblem: IMAGE_URL }];

    const response = await POST(request(null));
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      emblem: null,
      cost: 0,
    });
    expect(mocks.verifyImage).not.toHaveBeenCalled();
    expect(mocks.lockResources).not.toHaveBeenCalled();
    expect(mocks.updatedGuild).toEqual({ emblem: null });
  });

  it("허용되지 않은 URL은 DB 변경 전에 거부한다", async () => {
    mocks.verifyImage.mockResolvedValue({ ok: false, error: "bad_emblem" });

    const response = await POST(request("https://example.com/a.jpg"));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "bad_emblem",
    });
    expect(mocks.lockResources).not.toHaveBeenCalled();
    expect(mocks.updatedGuild).toBeNull();
  });

  it("길드 마스터가 아니면 변경할 수 없다", async () => {
    mocks.guildRows = [{ masterId: "u-other", emblem: null }];

    const response = await POST(request(IMAGE_URL));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "not_master",
    });
    expect(mocks.lockResources).not.toHaveBeenCalled();
    expect(mocks.updatedGuild).toBeNull();
  });
});
