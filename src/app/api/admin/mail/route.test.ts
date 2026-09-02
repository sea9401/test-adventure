import { beforeEach, describe, expect, it, vi } from "vitest";

const { audit, insertedRows } = vi.hoisted(() => ({
  audit: vi.fn(async () => {}),
  insertedRows: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/server/isAdmin", () => ({
  requireAdmin: vi.fn(async () => null),
  currentAdminEmail: vi.fn(async () => "admin@example.com"),
}));

vi.mock("@/lib/server/adminAudit", () => ({ logAdminAction: audit }));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => [{ id: "target-user" }]),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(async (rows: Record<string, unknown> | Record<string, unknown>[]) => {
        insertedRows.push(...(Array.isArray(rows) ? rows : [rows]));
      }),
    })),
  },
}));

import { POST } from "./route";

function request(body: unknown): Request {
  return new Request("http://test/api/admin/mail", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/mail 요리 재료", () => {
  beforeEach(() => {
    insertedRows.length = 0;
    audit.mockClear();
  });

  it("카탈로그에 있는 농장·낚시·상점·가공 재료만 우편에 보존한다", async () => {
    const response = await POST(
      request({
        target: "user",
        userId: "target-user",
        gold: 0,
        cookingIngredients: [
          { ingredientId: "farm:wheat", count: 5 },
          { ingredientId: "fishing:catch_legendary", count: 1 },
          { ingredientId: "pantry:salt", count: 4 },
          { ingredientId: "processed:flour", count: 2 },
          { ingredientId: "farm:compound_feed", count: 99 },
          { ingredientId: "fishing:unknown", count: 99 },
          { ingredientId: "pantry:unknown", count: 99 },
          { ingredientId: "processed:butter", count: 0 },
        ],
      }),
    );
    const json = (await response.json()) as {
      cookingIngredients?: Array<{ ingredientId: string; count: number }>;
    };

    expect(response.status).toBe(200);
    expect(json.cookingIngredients).toEqual([
      { ingredientId: "farm:wheat", count: 5 },
      { ingredientId: "fishing:catch_legendary", count: 1 },
      { ingredientId: "pantry:salt", count: 4 },
      { ingredientId: "processed:flour", count: 2 },
    ]);
    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0]?.payload).toMatchObject({
      cookingIngredients: json.cookingIngredients,
    });
  });

  it("숙련 증서만 있는 우편을 허용하고 상한을 적용한다", async () => {
    const response = await POST(
      request({
        target: "user",
        userId: "target-user",
        gold: 0,
        masteryCertificates: 1_500_000,
      }),
    );
    const json = (await response.json()) as {
      masteryCertificates?: number;
    };

    expect(response.status).toBe(200);
    expect(json.masteryCertificates).toBe(1_000_000);
    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0]).toMatchObject({
      kind: "admin_gift",
      payload: { masteryCertificates: 1_000_000 },
    });
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({ masteryCertificates: 1_000_000 }),
      }),
    );
  });
});
