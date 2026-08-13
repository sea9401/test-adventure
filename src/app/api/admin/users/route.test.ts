import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const mocks = vi.hoisted(() => ({
  gate: vi.fn(async () => null as Response | null),
  select: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
}));

vi.mock("@/lib/server/isAdmin", () => ({
  requireAdmin: mocks.gate,
  isSuperAdminEmail: vi.fn((email: string | null) => email === "active@example.com"),
}));
vi.mock("@/db", () => ({ db: { select: mocks.select } }));

import { GET } from "./route";

describe("GET /api/admin/users", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.gate.mockResolvedValue(null);
    mocks.limit.mockResolvedValue([
      {
        id: "active-user",
        email: "active@example.com",
        gameName: "활동 유저",
        className: "전사",
        lastSeenAt: new Date("2026-08-04T00:00:00.000Z"),
        createdAt: new Date("2026-07-01T00:00:00.000Z"),
      },
      {
        id: "beta-user",
        email: "beta@example.com",
        gameName: "베타 유저",
        className: null,
        lastSeenAt: null,
        createdAt: new Date("2025-01-01T00:00:00.000Z"),
      },
    ]);
    mocks.orderBy.mockReturnValue({ limit: mocks.limit });
    const query = {
      where: vi.fn(() => query),
      orderBy: mocks.orderBy,
    };
    mocks.select.mockReturnValue({
      from: vi.fn(() => ({ leftJoin: vi.fn(() => query) })),
    });
  });

  it("마지막 접속이 없는 계정을 생성일과 관계없이 맨 아래로 정렬한다", async () => {
    const response = await GET(new Request("http://test/api/admin/users"));
    const [lastSeenOrder] = mocks.orderBy.mock.calls[0] as [SQL, SQL];
    const compiled = new PgDialect().sqlToQuery(lastSeenOrder);

    expect(response.status).toBe(200);
    expect(compiled.sql).toBe('"presence"."last_seen_at" desc nulls last');
    expect(await response.json()).toEqual([
      expect.objectContaining({
        id: "active-user",
        lastSeenAt: "2026-08-04T00:00:00.000Z",
        isSuperAdmin: true,
      }),
      expect.objectContaining({
        id: "beta-user",
        lastSeenAt: null,
        isSuperAdmin: false,
      }),
    ]);
  });

  it("관리자 권한이 없으면 DB를 조회하지 않는다", async () => {
    mocks.gate.mockResolvedValue(new Response("forbidden", { status: 403 }));

    const response = await GET(new Request("http://test/api/admin/users"));

    expect(response.status).toBe(403);
    expect(mocks.select).not.toHaveBeenCalled();
  });
});
