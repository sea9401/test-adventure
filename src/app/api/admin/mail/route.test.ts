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

  it("카탈로그에 있는 상점·가공 재료만 우편에 보존한다", async () => {
    const response = await POST(
      request({
        target: "user",
        userId: "target-user",
        gold: 0,
        cookingIngredients: [
          { ingredientId: "pantry:salt", count: 4 },
          { ingredientId: "processed:flour", count: 2 },
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
      { ingredientId: "pantry:salt", count: 4 },
      { ingredientId: "processed:flour", count: 2 },
    ]);
    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0]?.payload).toMatchObject({
      cookingIngredients: json.cookingIngredients,
    });
  });
});
