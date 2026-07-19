import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = {
    selectRows: [] as unknown[][],
    updatedGuild: null as Record<string, unknown> | null,
  };
  const tx = {
    select: vi.fn(() => {
      const rows = state.selectRows.shift() ?? [];
      const builder = {
        from: vi.fn(),
        where: vi.fn(),
        for: vi.fn(),
        limit: vi.fn(async () => rows),
      };
      builder.from.mockReturnValue(builder);
      builder.where.mockReturnValue(builder);
      builder.for.mockReturnValue(builder);
      return builder;
    }),
    update: vi.fn(() => ({
      set: vi.fn((values: Record<string, unknown>) => {
        state.updatedGuild = values;
        return { where: vi.fn(async () => undefined) };
      }),
    })),
  };
  return {
    state,
    tx,
    ensureUser: vi.fn(async () => "u-manager"),
    rateLimit: vi.fn(() => null),
    lockGuildResources: vi.fn(async () => ({ gold: 100_000_000 })),
    upsertGuildResources: vi.fn(async () => undefined),
    logGuildActivity: vi.fn(async () => undefined),
  };
});

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: typeof mocks.tx) => unknown) =>
      callback(mocks.tx),
    ),
  },
}));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: mocks.ensureUser,
}));
vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: mocks.rateLimit,
}));
vi.mock("@/lib/server/v2GuildResources", () => ({
  lockGuildResources: mocks.lockGuildResources,
  upsertGuildResources: mocks.upsertGuildResources,
}));
vi.mock("@/lib/server/guildActivityLog", () => ({
  logGuildActivity: mocks.logGuildActivity,
}));

import { POST } from "./route";

function request() {
  return new Request("http://localhost/api/v2/guild/level", {
    method: "POST",
  });
}

function setRows({
  role = "manager",
  level = 1,
  fameAvailable = 10_000,
}: {
  role?: string;
  level?: number;
  fameAvailable?: number;
} = {}) {
  mocks.state.selectRows = [
    [{ guildId: 7, role }],
    [{ level, fameAvailable }],
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state.updatedGuild = null;
  setRows();
  mocks.ensureUser.mockResolvedValue("u-manager");
  mocks.rateLimit.mockReturnValue(null);
  mocks.lockGuildResources.mockResolvedValue({ gold: 100_000_000 });
});

describe("길드 레벨 수동 승급", () => {
  it("관리자가 사용 가능 명성과 길드 골드를 함께 소비해 한 단계 올린다", async () => {
    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      level: 2,
      fameAvailable: 7_000,
      guildGold: 90_000_000,
    });
    expect(mocks.state.updatedGuild).toEqual(
      expect.objectContaining({ level: 2, fameAvailable: expect.anything() }),
    );
    expect(mocks.upsertGuildResources).toHaveBeenCalledWith(
      mocks.tx,
      7,
      { gold: 90_000_000 },
    );
    expect(mocks.logGuildActivity).toHaveBeenCalledWith(
      mocks.tx,
      expect.objectContaining({
        guildId: 7,
        type: "guild_level_upgrade",
        meta: { guildLevel: 2, fameCost: 3_000, goldCost: 10_000_000 },
      }),
    );
  });

  it("일반 길드원은 승급할 수 없다", async () => {
    setRows({ role: "member" });

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("not_allowed");
    expect(mocks.lockGuildResources).not.toHaveBeenCalled();
  });

  it("사용 가능한 명성이 부족하면 어느 재화도 차감하지 않는다", async () => {
    setRows({ fameAvailable: 2_999 });

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("insufficient_fame");
    expect(mocks.state.updatedGuild).toBeNull();
    expect(mocks.upsertGuildResources).not.toHaveBeenCalled();
  });

  it("길드 골드가 부족하면 어느 재화도 차감하지 않는다", async () => {
    mocks.lockGuildResources.mockResolvedValue({ gold: 9_999_999 });

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("insufficient_gold");
    expect(mocks.state.updatedGuild).toBeNull();
    expect(mocks.upsertGuildResources).not.toHaveBeenCalled();
  });

  it("최고 레벨에서는 추가 승급하지 않는다", async () => {
    setRows({ level: 5 });

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("maxed");
    expect(mocks.state.updatedGuild).toBeNull();
  });
});
