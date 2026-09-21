import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { guildMembers, guilds, presence } from "@/db/schema";

const mocks = vi.hoisted(() => ({
  userId: "applicant" as string | null,
  members: [] as unknown[][],
  guild: [] as unknown[],
  presence: [] as unknown[],
  locks: vi.fn(),
  where: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  transaction: vi.fn(),
  log: vi.fn(),
}));

vi.mock("@/lib/server/ensureUser", () => ({ ensureUser: async () => mocks.userId }));
vi.mock("@/lib/server/resolveActor", () => ({
  resolveActor: async () => ({ name: "승계자", className: "모험가", title: null }),
}));
vi.mock("@/lib/server/guildActivityLog", () => ({ logGuildActivity: mocks.log }));
vi.mock("@/db", async () => {
  const { guildMembers, guilds } = await import("@/db/schema");
  const tx = {
    select: () => ({ from: (table: unknown) => {
      const rows = table === guildMembers ? mocks.members.shift() ?? []
        : table === guilds ? mocks.guild : mocks.presence;
      const chain = {
        where: (condition: unknown) => { mocks.where(table, condition); return chain; },
        for: (mode: string) => { mocks.locks(table, mode); return chain; },
        limit: () => chain,
        then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve),
      };
      return chain;
    } }),
    update: (table: unknown) => ({ set: (values: unknown) => ({
      where: async (condition: unknown) => { mocks.update(table, values, condition); },
    }) }),
    insert: (table: unknown) => ({ values: (values: unknown) => ({
      onConflictDoUpdate: async (conflict: unknown) => { mocks.insert(table, values, conflict); },
    }) }),
  };
  return { db: { transaction: (run: (tx: unknown) => unknown) => {
    mocks.transaction();
    return run(tx);
  } } };
});

import { POST } from "./route";

const now = new Date("2026-09-21T05:00:00Z");
const request = (body: unknown = { expectedMasterId: "old-master" }) => new Request(
  "http://test/api/v2/guild/claim-leadership",
  { method: "POST", body: JSON.stringify(body) },
);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  mocks.userId = "applicant";
  mocks.members = [[{ guildId: 7 }], [{ userId: "applicant", role: "member" }]];
  mocks.guild = [{ masterId: "old-master", disbandedAt: null }];
  mocks.presence = [{ lastSeenAt: new Date(now.getTime() - 72 * 60 * 60 * 1000) }];
});
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

async function expectRejected(status: number, error: string) {
  const response = await POST(request());
  expect(response.status).toBe(status);
  expect(await response.json()).toMatchObject({ ok: false, error });
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.insert).not.toHaveBeenCalled();
  expect(mocks.log).not.toHaveBeenCalled();
}

describe("길드장 승계 API", () => {
  it("미인증 요청을 거절한다", async () => {
    mocks.userId = null;
    await expectRejected(401, "unauthorized");
  });
  it.each([null, {}, { expectedMasterId: 7 }, { expectedMasterId: "" }])(
    "길드장 ID 없는 요청 %j를 거절한다", async (body) => {
      expect((await POST(request(body))).status).toBe(400);
      expect(mocks.transaction).not.toHaveBeenCalled();
    },
  );
  it("잘못된 JSON을 거절한다", async () => {
    const res = await POST(new Request("http://test", { method: "POST", body: "{" }));
    expect(res.status).toBe(400);
  });
  it("무소속은 신청할 수 없다", async () => {
    mocks.members = [[]];
    await expectRejected(403, "no_guild");
  });
  it("길드 잠금 대기 중 소속을 잃었으면 거절한다", async () => {
    mocks.members = [[{ guildId: 7 }], []];
    await expectRejected(403, "no_guild");
  });
  it("이미 길드장이 바뀌었으면 거절한다", async () => {
    mocks.guild = [{ masterId: "new-master", disbandedAt: null }];
    await expectRejected(409, "master_changed");
  });
  it("길드장 본인은 승계할 수 없다", async () => {
    mocks.userId = "old-master";
    await expectRejected(409, "already_master");
  });
  it.each([{ guild: [] }, { guild: [{ masterId: "old-master", disbandedAt: now }] }])(
    "없거나 해산된 길드는 거절한다", async ({ guild }) => {
      mocks.guild = guild;
      await expectRejected(404, "guild_not_found");
    },
  );
  it("접속 기록이 없으면 거절한다", async () => {
    mocks.presence = [];
    await expectRejected(409, "master_active");
  });
  it("72시간이 1ms라도 모자라면 거절한다", async () => {
    mocks.presence = [{ lastSeenAt: new Date(now.getTime() - 72 * 60 * 60 * 1000 + 1) }];
    await expectRejected(409, "master_active");
  });
  it("신청 전에 길드장이 복귀했다면 거절한다", async () => {
    mocks.presence = [{ lastSeenAt: now }];
    await expectRejected(409, "master_active");
  });
  it("일반 길드원이 정확히 72시간 후 승계하고 기존 길드장은 일반 길드원이 된다", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, newMasterId: "applicant" });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.locks.mock.calls).toEqual([
      [guilds, "update"], [guildMembers, "update"], [presence, "update"],
    ]);
    expect(mocks.update.mock.calls.map(([table, values]) => [table, values])).toEqual([
      [guilds, { masterId: "applicant" }],
      [guildMembers, { role: "master" }],
      [guildMembers, { role: "member" }],
    ]);
    // 소속 재확인과 역할 변경의 WHERE 절에 길드와 정확한 사용자 모두 포함해야 한다.
    const dialect = new PgDialect();
    const memberFilters = mocks.where.mock.calls.filter(([table]) => table === guildMembers);
    expect(dialect.sqlToQuery(memberFilters[1][1]).params).toEqual([7, "applicant"]);
    const updates = mocks.update.mock.calls.map(([, , condition]) => dialect.sqlToQuery(condition).params);
    expect(updates).toEqual([[7], [7, "applicant"], [7, "old-master"]]);
    expect(mocks.insert).toHaveBeenCalledWith(presence,
      expect.objectContaining({ userId: "applicant", lastSeenAt: now }),
      expect.objectContaining({ target: presence.userId, set: expect.objectContaining({ lastSeenAt: now }) }),
    );
    expect(mocks.log).toHaveBeenCalledWith(expect.anything(), {
      guildId: 7, type: "leadership_claim", actorUserId: "applicant", targetUserId: "old-master",
    });
  });
  it("먼저 승계한 사람이 있으면 대기하던 신청은 실패한다", async () => {
    expect((await POST(request())).status).toBe(200);
    vi.clearAllMocks();
    mocks.userId = "second-applicant";
    mocks.members = [[{ guildId: 7 }], [{ userId: "second-applicant" }]];
    mocks.guild = [{ masterId: "applicant", disbandedAt: null }];
    await expectRejected(409, "master_changed");
  });
});
