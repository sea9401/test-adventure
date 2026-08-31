import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

function request(body: unknown) {
  return new Request("http://localhost/api/v2/guild/combat-supply", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function setRows({
  role = "manager",
  buffs = [],
}: {
  role?: string;
  buffs?: unknown[];
} = {}) {
  mocks.state.selectRows = [
    [{ guildId: 7, role }],
    [{ fameTotal: 12_000, fameAvailable: 8_000, buffs }],
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-22T00:00:00.000Z"));
  mocks.state.updatedGuild = null;
  mocks.ensureUser.mockResolvedValue("u-manager");
  mocks.rateLimit.mockReturnValue(null);
  mocks.lockGuildResources.mockResolvedValue({ gold: 100_000_000 });
  setRows();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("주간 길드 전투보급 운용비", () => {
  it("관리자가 1단계 운용비를 결제하면 길드 자금과 주간 효과를 함께 갱신한다", async () => {
    const response = await POST(request({ action: "fund_operations" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      guildGold: 90_000_000,
      operations: {
        weekKey: "2026-08-17",
        tier: 1,
        maxTier: 3,
        nextCost: 20_000_000,
        goldPct: 1,
        expPct: 1,
        proficiencyChancePct: 5,
      },
    });
    expect(mocks.state.updatedGuild?.buffs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ buffId: "combat_operations", tier: 1 }),
      ]),
    );
    expect(mocks.upsertGuildResources).toHaveBeenCalledWith(mocks.tx, 7, {
      gold: 90_000_000,
    });
    expect(mocks.logGuildActivity).toHaveBeenCalledWith(
      mocks.tx,
      expect.objectContaining({
        guildId: 7,
        type: "combat_supply_funding",
        meta: { operationsTier: 1, goldCost: 10_000_000 },
      }),
    );
  });

  it("일반 길드원은 운용비를 결제할 수 없다", async () => {
    setRows({ role: "member" });

    const response = await POST(request({ action: "fund_operations" }));

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("not_allowed");
    expect(mocks.lockGuildResources).not.toHaveBeenCalled();
  });

  it("다음 단계 비용보다 길드 자금이 적으면 아무 상태도 바꾸지 않는다", async () => {
    mocks.lockGuildResources.mockResolvedValue({ gold: 9_999_999 });

    const response = await POST(request({ action: "fund_operations" }));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: "insufficient_gold",
      guildGold: 9_999_999,
      required: 10_000_000,
    });
    expect(mocks.state.updatedGuild).toBeNull();
    expect(mocks.upsertGuildResources).not.toHaveBeenCalled();
  });

  it("이번 주 3단계에 도달하면 추가 결제를 거절한다", async () => {
    setRows({
      buffs: [
        {
          buffId: "combat_operations",
          tier: 3,
          installedAt: "2026-08-21T12:00:00.000Z",
        },
      ],
    });

    const response = await POST(request({ action: "fund_operations" }));

    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("operations_maxed");
    expect(mocks.upsertGuildResources).not.toHaveBeenCalled();
  });

  it("지난 주 운용 기록은 만료되어 새 1단계부터 다시 결제한다", async () => {
    setRows({
      buffs: [
        {
          buffId: "combat_operations",
          tier: 3,
          installedAt: "2026-08-16T14:59:59.000Z",
        },
      ],
    });

    const response = await POST(request({ action: "fund_operations" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      guildGold: 90_000_000,
      operations: { tier: 1, nextCost: 20_000_000 },
    });
  });

  it("알 수 없는 POST 동작은 트랜잭션 전에 거절한다", async () => {
    const response = await POST(request({ action: "unknown" }));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("invalid_action");
    expect(mocks.tx.select).not.toHaveBeenCalled();
  });

  it("기존 명성 전투보급 승급은 같은 요청 형식으로 유지한다", async () => {
    const response = await POST(request({ supplyId: "combat_gold" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.fameAvailable).toBe(7_800);
    expect(body.supplies).toContainEqual(
      expect.objectContaining({ id: "combat_gold", level: 1 }),
    );
    expect(mocks.state.updatedGuild).toEqual(
      expect.objectContaining({ fameAvailable: expect.anything() }),
    );
  });
});
