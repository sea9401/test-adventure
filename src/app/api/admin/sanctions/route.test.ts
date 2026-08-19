import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { userSanctions, users } from "@/db/schema";

type TargetRow = {
  id: string;
  gameName: string | null;
  bannedUntil: Date | null;
  banReason: string | null;
  tradeSuspendedUntil: Date | null;
  tradeSuspensionReason: string | null;
};

const cleanupResult = {
  listingsCancelled: 2,
  buyOrdersCancelled: 1,
  highestBidsCleared: 1,
  refundedGold: 12_000,
};

const mocks = vi.hoisted(() => ({
  gate: vi.fn(async () => null as Response | null),
  currentAdminEmail: vi.fn(async () => "admin@example.com"),
  audit: vi.fn(async (_entry: unknown) => undefined),
  cleanup: vi.fn(async (_tx: unknown, _userId: string, _now: Date) => ({
    listingsCancelled: 2,
    buyOrdersCancelled: 1,
    highestBidsCleared: 1,
    refundedGold: 12_000,
  })),
  transaction: vi.fn(),
  dbSelect: vi.fn(),
  dbInsert: vi.fn(),
  dbUpdate: vi.fn(),
  events: [] as string[],
  updates: [] as Array<{
    table: unknown;
    values: Record<string, unknown>;
    condition: unknown;
  }>,
  inserts: [] as Array<{ table: unknown; values: Record<string, unknown> }>,
  target: {
    id: "u",
    gameName: "대상 모험가",
    bannedUntil: null,
    banReason: null,
    tradeSuspendedUntil: null,
    tradeSuspensionReason: null,
  } as TargetRow | null,
  sanctions: [] as Array<Record<string, unknown>>,
}));

function selectQuery() {
  let table: unknown;
  const query = {
    from(selected: unknown) {
      table = selected;
      return query;
    },
    where() {
      return query;
    },
    orderBy() {
      return query;
    },
    for() {
      return query;
    },
    limit: vi.fn(async () => {
      if (table === users) return mocks.target ? [mocks.target] : [];
      if (table === userSanctions) return mocks.sanctions;
      return [];
    }),
  };
  return query;
}

const tx = {
  select: mocks.dbSelect,
  insert: mocks.dbInsert,
  update: mocks.dbUpdate,
};

vi.mock("@/lib/server/isAdmin", () => ({
  requireAdmin: mocks.gate,
  requireAdminRole: mocks.gate,
  currentAdminEmail: mocks.currentAdminEmail,
}));
vi.mock("@/lib/server/adminAudit", () => ({
  logAdminAction: vi.fn(async (entry: unknown) => {
    mocks.events.push("audit");
    return mocks.audit(entry);
  }),
}));
vi.mock("@/lib/server/tradeSuspensionCleanup", () => ({
  clearActiveTradeExposure: vi.fn(async (executor: unknown, userId: string, now: Date) => {
    mocks.events.push("cleanup");
    return mocks.cleanup(executor, userId, now);
  }),
}));
vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => mocks.dbSelect(...args),
    insert: (...args: unknown[]) => mocks.dbInsert(...args),
    update: (...args: unknown[]) => mocks.dbUpdate(...args),
    transaction: (...args: unknown[]) => mocks.transaction(...args),
  },
}));

import { GET, POST } from "./route";

function request(body: unknown): Request {
  return new Request("http://test/api/admin/sanctions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function post(body: unknown) {
  const response = await POST(request(body));
  return { status: response.status, body: await response.json() };
}

function recursiveStrings(value: unknown, seen = new Set<object>()): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap((entry) => recursiveStrings(entry, seen));
  if (!value || typeof value !== "object" || seen.has(value)) return [];
  seen.add(value);
  if ("value" in value) {
    return recursiveStrings((value as { value: unknown }).value, seen);
  }
  if ("queryChunks" in value) {
    return recursiveStrings(
      (value as { queryChunks: unknown }).queryChunks,
      seen,
    );
  }
  return Object.values(value).flatMap((entry) => recursiveStrings(entry, seen));
}

function lastUserUpdate() {
  return mocks.updates.filter((entry) => entry.table === users).at(-1);
}

function lastSanctionUpdate() {
  return mocks.updates.filter((entry) => entry.table === userSanctions).at(-1);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-20T12:00:00.000Z"));
  vi.clearAllMocks();
  mocks.events.length = 0;
  mocks.updates.length = 0;
  mocks.inserts.length = 0;
  mocks.target = {
    id: "u",
    gameName: "대상 모험가",
    bannedUntil: null,
    banReason: null,
    tradeSuspendedUntil: null,
    tradeSuspensionReason: null,
  };
  mocks.sanctions = [];
  mocks.gate.mockResolvedValue(null);
  mocks.cleanup.mockResolvedValue(cleanupResult);
  mocks.dbSelect.mockImplementation(() => selectQuery());
  mocks.dbInsert.mockImplementation((table: unknown) => ({
    values: vi.fn(async (values: Record<string, unknown>) => {
      mocks.inserts.push({ table, values });
    }),
  }));
  mocks.dbUpdate.mockImplementation((table: unknown) => ({
    set: vi.fn((values: Record<string, unknown>) => ({
      where: vi.fn(async (condition: unknown) => {
        mocks.updates.push({ table, values, condition });
      }),
    })),
  }));
  mocks.transaction.mockImplementation(
    async (callback: (executor: typeof tx) => Promise<unknown>) => {
      mocks.events.push("transaction:begin");
      const result = await callback(tx);
      mocks.events.push("transaction:commit");
      return result;
    },
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe("/api/admin/sanctions", () => {
  it("scope가 없는 기존 기간 정지 요청을 계정 제재로 처리하고 활성 거래를 정리한다", async () => {
    const result = await post({
      userId: "u",
      action: "suspend",
      days: 3,
      reason: "조사",
    });

    expect(result).toMatchObject({ status: 200, body: { banned: true } });
    expect(mocks.inserts.at(-1)?.values).toMatchObject({ type: "suspend" });
    expect(lastUserUpdate()?.values).toMatchObject({ banReason: "조사" });
    expect(lastUserUpdate()?.values).not.toHaveProperty("tradeSuspendedUntil");
    expect(mocks.cleanup).toHaveBeenCalledWith(tx, "u", expect.any(Date));
  });

  it("거래 기간 정지를 독립 필드와 이력에 적용하고 커밋 뒤 정리 건수를 감사한다", async () => {
    const result = await post({
      userId: "u",
      scope: "trade",
      action: "suspend",
      days: 3,
      reason: "조사",
      adminMemo: "이상 입찰 확인",
    });

    expect(result).toMatchObject({
      status: 200,
      body: { tradeSuspended: true, cleanup: cleanupResult },
    });
    expect(mocks.inserts.at(-1)?.values).toMatchObject({
      type: "trade_suspend",
      reason: "조사",
    });
    expect(lastUserUpdate()?.values).toMatchObject({
      tradeSuspensionReason: "조사",
    });
    expect(lastUserUpdate()?.values).not.toHaveProperty("bannedUntil");
    expect(mocks.cleanup).toHaveBeenCalledWith(tx, "u", expect.any(Date));
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "sanction.trade_suspend",
        detail: expect.objectContaining({
          reason: "조사",
          adminMemo: "이상 입찰 확인",
          days: 3,
          listingsCancelled: 2,
          buyOrdersCancelled: 1,
          highestBidsCleared: 1,
          refundedGold: 12_000,
        }),
      }),
    );
    expect(mocks.events.indexOf("transaction:commit")).toBeLessThan(
      mocks.events.indexOf("audit"),
    );
  });

  it("거래 영구 정지를 전용 이력과 영구 센티넬로 적용한다", async () => {
    const result = await post({
      userId: "u",
      scope: "trade",
      action: "ban",
      reason: "거래 악용",
    });

    expect(result).toMatchObject({ status: 200, body: { tradeSuspended: true } });
    expect(mocks.inserts.at(-1)?.values).toMatchObject({
      type: "trade_ban",
      expiresAt: new Date("9999-12-31T00:00:00.000Z"),
    });
    expect(lastUserUpdate()?.values).toMatchObject({
      tradeSuspendedUntil: new Date("9999-12-31T00:00:00.000Z"),
    });
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "sanction.trade_ban" }),
    );
  });

  it("활성 거래 정지 기간을 현재 만료 시각에서 연장한다", async () => {
    mocks.target!.tradeSuspendedUntil = new Date("2026-08-25T00:00:00.000Z");
    mocks.target!.tradeSuspensionReason = "기존 조사";

    const result = await post({
      userId: "u",
      scope: "trade",
      action: "extend",
      days: 2,
      reason: "추가 조사",
    });

    expect(result.status).toBe(200);
    expect(mocks.inserts.at(-1)?.values).toMatchObject({
      type: "trade_suspend",
      expiresAt: new Date("2026-08-27T00:00:00.000Z"),
    });
    expect(lastUserUpdate()?.values).toMatchObject({
      tradeSuspendedUntil: new Date("2026-08-27T00:00:00.000Z"),
      tradeSuspensionReason: "추가 조사",
    });
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "sanction.trade_extend" }),
    );
  });

  it("거래 제재 해제는 거래 필드와 거래 제재 이력만 해제한다", async () => {
    const result = await post({ userId: "u", scope: "trade", action: "lift" });

    expect(result).toMatchObject({ status: 200, body: { tradeSuspended: false } });
    expect(lastUserUpdate()?.values).toMatchObject({
      tradeSuspendedUntil: null,
      tradeSuspensionReason: null,
    });
    expect(lastUserUpdate()?.values).not.toHaveProperty("bannedUntil");
    const filterValues = recursiveStrings(lastSanctionUpdate()?.condition);
    expect(filterValues).toEqual(expect.arrayContaining(["trade_suspend", "trade_ban"]));
    expect(filterValues).not.toEqual(expect.arrayContaining(["suspend", "ban"]));
    expect(mocks.cleanup).not.toHaveBeenCalled();
  });

  it("계정 제재 해제는 계정 필드와 계정 제재 이력만 해제해 독립 거래 정지를 보존한다", async () => {
    mocks.target!.tradeSuspendedUntil = new Date("2026-08-25T00:00:00.000Z");
    mocks.target!.tradeSuspensionReason = "독립 거래 조사";

    const result = await post({ userId: "u", scope: "account", action: "lift" });

    expect(result).toMatchObject({ status: 200, body: { banned: false } });
    expect(lastUserUpdate()?.values).toMatchObject({ bannedUntil: null, banReason: null });
    expect(lastUserUpdate()?.values).not.toHaveProperty("tradeSuspendedUntil");
    const filterValues = recursiveStrings(lastSanctionUpdate()?.condition);
    expect(filterValues).toEqual(expect.arrayContaining(["suspend", "ban"]));
    expect(filterValues).not.toEqual(
      expect.arrayContaining(["trade_suspend", "trade_ban"]),
    );
  });

  it("거래 제재 부과와 연장은 공백이 아닌 유저 노출 사유를 요구한다", async () => {
    for (const action of ["suspend", "ban", "extend"] as const) {
      const result = await post({
        userId: "u",
        scope: "trade",
        action,
        days: action === "ban" ? undefined : 1,
        reason: "   ",
      });
      expect(result).toMatchObject({ status: 400 });
    }
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("계정 영구 밴도 제재 트랜잭션 안에서 활성 거래를 정리한다", async () => {
    const result = await post({ userId: "u", action: "ban", reason: "악용" });

    expect(result.status).toBe(200);
    expect(mocks.cleanup).toHaveBeenCalledWith(tx, "u", expect.any(Date));
    expect(mocks.events).toEqual([
      "transaction:begin",
      "cleanup",
      "transaction:commit",
      "audit",
    ]);
  });

  it("활성 거래 정리가 실패하면 제재 트랜잭션을 커밋하거나 감사하지 않는다", async () => {
    mocks.cleanup.mockRejectedValueOnce(new Error("cleanup failed"));

    await expect(
      POST(request({ userId: "u", scope: "trade", action: "ban", reason: "악용" })),
    ).rejects.toThrow("cleanup failed");
    expect(mocks.events).not.toContain("transaction:commit");
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("조회 응답에서 계정 상태와 독립 거래 제재 상태를 함께 제공한다", async () => {
    mocks.target!.tradeSuspendedUntil = new Date("9999-12-31T00:00:00.000Z");
    mocks.target!.tradeSuspensionReason = "거래 악용";

    const response = await GET(
      new Request("http://test/api/admin/sanctions?userId=u"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      banned: false,
      trade: {
        suspended: true,
        suspendedUntil: "9999-12-31T00:00:00.000Z",
        reason: "거래 악용",
        permanent: true,
      },
    });
  });
});
