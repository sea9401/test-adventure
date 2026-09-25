import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = { rows: [] as unknown[][], inserts: [] as Array<{ table: unknown; values: unknown }> };
  const tx = {
    select: vi.fn(() => {
      const rows = state.rows.shift() ?? [];
      const builder = {
        from: vi.fn(), where: vi.fn(), for: vi.fn(),
        limit: vi.fn(async () => rows),
        orderBy: vi.fn(async () => rows),
      };
      builder.from.mockReturnValue(builder);
      builder.where.mockReturnValue(builder);
      builder.for.mockReturnValue(builder);
      return builder;
    }),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => undefined) })) })),
    insert: vi.fn((table: unknown) => ({ values: vi.fn(async (values: unknown) => { state.inserts.push({ table, values }); }) })),
  };
  return {
    state, tx,
    ensureUser: vi.fn(async () => "master-1"),
    rateLimit: vi.fn(() => null),
    lockGuildResources: vi.fn(async () => ({ gold: 50_000_000 })),
    upsertGuildResources: vi.fn(async () => undefined),
    logGuildActivity: vi.fn(async () => undefined),
  };
});

vi.mock("@/db", () => ({ db: { transaction: vi.fn(async (callback: (tx: typeof mocks.tx) => unknown) => callback(mocks.tx)) } }));
vi.mock("@/lib/server/ensureUser", () => ({ ensureUser: mocks.ensureUser }));
vi.mock("@/lib/server/userRateLimit", () => ({ enforceUserAndIpRateLimit: mocks.rateLimit }));
vi.mock("@/lib/server/v2GuildResources", () => ({ lockGuildResources: mocks.lockGuildResources, upsertGuildResources: mocks.upsertGuildResources }));
vi.mock("@/lib/server/guildActivityLog", () => ({ logGuildActivity: mocks.logGuildActivity }));

import { marketplaceInbox } from "@/db/schema";
import { POST } from "./route";

const request = () => new Request("http://localhost/api/v2/guild/weekly-supplies", { method: "POST" });

function rows(role = "master", buffs: unknown[] = []) {
  mocks.state.rows = [
    [{ guildId: 7, role }],
    [{ name: "별빛 길드", buffs }],
    [{ userId: "master-1" }, { userId: "member-2" }],
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-25T12:00:00.000Z"));
  mocks.state.inserts = [];
  mocks.lockGuildResources.mockResolvedValue({ gold: 50_000_000 });
  rows();
});
afterEach(() => vi.useRealTimers());

describe("길드 주간 지원품", () => {
  it("관리자가 자금을 한 번 지출하면 현재 길드원에게 귀속 회복약 우편을 보낸다", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, funded: true, guildGold: 20_000_000, recipientCount: 2 });
    expect(mocks.upsertGuildResources).toHaveBeenCalledWith(mocks.tx, 7, { gold: 20_000_000 });
    const mail = mocks.state.inserts.find((entry) => entry.table === marketplaceInbox)?.values as Array<{ userId: string; payload: Record<string, unknown> }>;
    expect(mail).toHaveLength(2);
    expect(mail.map((entry) => entry.userId)).toEqual(["master-1", "member-2"]);
    expect(mail[0].payload).toMatchObject({ source: "guild_weekly_supplies", staminaPotions: 3, staminaPotionsBound: true });
    expect(mocks.logGuildActivity).toHaveBeenCalledWith(mocks.tx, expect.objectContaining({
      type: "weekly_supplies_funding",
      meta: { goldCost: 30_000_000, recipientCount: 2 },
    }));
  });

  it("같은 주 재결제와 자금 부족은 우편 발송 없이 거절한다", async () => {
    rows("master", [{ buffId: "weekly_member_supplies", tier: 1, installedAt: "2026-09-25T12:00:00.000Z" }]);
    expect((await POST(request())).status).toBe(409);
    expect(mocks.state.inserts).toHaveLength(0);
    rows();
    mocks.lockGuildResources.mockResolvedValue({ gold: 29_999_999 });
    expect((await POST(request())).status).toBe(409);
    expect(mocks.state.inserts).toHaveLength(0);
  });

  it("일반 길드원은 결제할 수 없다", async () => {
    rows("member");
    expect((await POST(request())).status).toBe(403);
    expect(mocks.lockGuildResources).not.toHaveBeenCalled();
  });
});
