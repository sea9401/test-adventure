import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  readStatus: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  where: vi.fn(),
  returning: vi.fn(),
  select: vi.fn(),
  transaction: vi.fn(),
  tradeCurrentUntil: new Date("2026-08-25T00:00:00.000Z") as Date | null,
}));

vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/server/playerSanctions", () => ({
  readPlayerSanctionStatus: mocks.readStatus,
}));
vi.mock("@/db", () => ({
  db: {
    update: mocks.update,
    transaction: mocks.transaction,
  },
}));

import { GET, POST } from "@/app/api/v2/me/sanctions/route";

function acknowledgeRequest(body: unknown) {
  return new Request("http://test.local/api/v2/me/sanctions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function recursiveDates(value: unknown, seen = new Set<object>()): Date[] {
  if (value instanceof Date) return [value];
  if (!value || typeof value !== "object" || seen.has(value)) return [];
  seen.add(value);
  return Object.values(value).flatMap((entry) => recursiveDates(entry, seen));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-20T12:00:00.000Z"));
  vi.clearAllMocks();
  mocks.tradeCurrentUntil = new Date("2026-08-25T00:00:00.000Z");
  mocks.auth.mockResolvedValue({ user: { id: "u-test" } });
  mocks.update.mockReturnValue({ set: mocks.set });
  mocks.set.mockReturnValue({ where: mocks.where });
  mocks.where.mockReturnValue({ returning: mocks.returning });
  mocks.returning.mockResolvedValue([{ id: 7 }]);
  mocks.select.mockImplementation(() => {
    const query = {
      from: vi.fn(() => query),
      where: vi.fn(() => query),
      for: vi.fn(() => query),
      limit: vi.fn(async () => [
        { expiresAt: mocks.tradeCurrentUntil },
      ]),
    };
    return query;
  });
  mocks.transaction.mockImplementation(
    async (
      callback: (executor: {
        select: typeof mocks.select;
        update: typeof mocks.update;
      }) => Promise<unknown>,
    ) => callback({ select: mocks.select, update: mocks.update }),
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe("/api/v2/me/sanctions", () => {
  it("정지와 미확인 경고 상태를 로그인한 이용자에게 반환한다", async () => {
    mocks.readStatus.mockResolvedValue({
      suspension: {
        reason: "자동화 의심 행위 반복",
        expiresAt: "2026-07-17T00:00:00.000Z",
        permanent: false,
      },
      tradeSuspension: {
        id: 11,
        reason: "비정상 거래 조사",
        expiresAt: "2026-07-18T00:00:00.000Z",
        permanent: false,
        acknowledged: false,
      },
      warning: {
        id: 7,
        reason: "비정상 반복 플레이 패턴",
        createdAt: "2026-07-16T00:00:00.000Z",
      },
    });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      suspension: { permanent: false },
      tradeSuspension: {
        id: 11,
        reason: "비정상 거래 조사",
        permanent: false,
        acknowledged: false,
      },
      warning: { id: 7 },
    });
    expect(mocks.readStatus).toHaveBeenCalledWith("u-test");
  });

  it("로그인하지 않은 요청은 상태를 노출하지 않는다", async () => {
    mocks.auth.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mocks.readStatus).not.toHaveBeenCalled();
  });

  it("본인의 미확인 경고를 확인 처리한다", async () => {
    const response = await POST(acknowledgeRequest({ warningId: 7 }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, warningId: 7 });
    expect(mocks.update).toHaveBeenCalledOnce();
    expect(mocks.set).toHaveBeenCalledWith({ acknowledgedAt: expect.any(Date) });
  });

  it("이미 확인했거나 본인 소유가 아닌 경고는 확인하지 않는다", async () => {
    mocks.returning.mockResolvedValue([]);

    const response = await POST(acknowledgeRequest({ warningId: 7 }));

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: "warning_not_found" });
  });

  it("올바른 경고 ID만 허용한다", async () => {
    const response = await POST(acknowledgeRequest({ warningId: "7" }));

    expect(response.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("본인의 활성 거래 정지 안내를 확인 처리한다", async () => {
    const response = await POST(acknowledgeRequest({ sanctionId: 11, kind: "trade" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, sanctionId: 11, kind: "trade" });
    expect(mocks.set).toHaveBeenCalledWith({ acknowledgedAt: expect.any(Date) });
    expect(recursiveDates(mocks.where.mock.calls.at(-1)?.[0])).toEqual(
      expect.arrayContaining([
        new Date("2026-08-20T12:00:00.000Z"),
        new Date("2026-08-25T00:00:00.000Z"),
      ]),
    );
  });

  it("만료된 거래 제재 이력은 확인 처리하지 않는다", async () => {
    mocks.tradeCurrentUntil = new Date("2026-08-19T00:00:00.000Z");

    const response = await POST(
      acknowledgeRequest({ sanctionId: 11, kind: "trade" }),
    );

    expect(response.status).toBe(404);
    expect(mocks.set).not.toHaveBeenCalled();
  });
});
