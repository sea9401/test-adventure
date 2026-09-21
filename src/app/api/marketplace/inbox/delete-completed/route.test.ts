import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userId: "u1" as string | null,
  execute: vi.fn(),
}));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: async () => mocks.userId,
}));

// Use the real Drizzle builder; replace only the external database transport.
vi.mock("@/db", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  return { db: drizzle(mocks.execute) };
});

async function post(): Promise<Response> {
  const route = await import("./route").catch(() => null);
  expect(route, "일괄 삭제 Route Handler가 구현되어야 합니다").not.toBeNull();
  return route!.POST();
}

beforeEach(() => {
  mocks.userId = "u1";
  mocks.execute.mockReset().mockResolvedValue({ rows: [[7], [8]] });
});

describe("POST /api/marketplace/inbox/delete-completed", () => {
  it("인증되지 않은 요청은 DB에 접근하지 않는다", async () => {
    mocks.userId = null;
    expect((await post()).status).toBe(401);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("본인 수신 우편 중 읽음·완료·미삭제 조건을 모두 만족하는 우편만 숨긴다", async () => {
    const response = await post();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      deletedIds: [7, 8],
    });
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    const [query, params] = mocks.execute.mock.calls[0];
    expect(query).toBe(
      'update "marketplace_inbox" set "recipient_deleted_at" = $1 where ("marketplace_inbox"."user_id" = $2 and "marketplace_inbox"."read_at" is not null and "marketplace_inbox"."claimed_at" is not null and "marketplace_inbox"."recipient_deleted_at" is null) returning "id"',
    );
    expect(params).toEqual([expect.any(String), "u1"]);
    expect(Number.isNaN(Date.parse(params[0]))).toBe(false);
  });

  it("목록의 최근 100개 제한과 관계없이 삭제 결과를 반환한다", async () => {
    mocks.execute.mockResolvedValue({
      rows: Array.from({ length: 125 }, (_, i) => [i + 1]),
    });
    const response = await post();
    const payload = await response.json();
    expect(payload.deletedIds).toHaveLength(125);
    expect(payload.deletedIds[124]).toBe(125);
  });

  it("삭제 대상이 없거나 이미 삭제한 경우 0건으로 성공한다", async () => {
    mocks.execute.mockResolvedValue({ rows: [] });
    const response = await post();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, deletedIds: [] });
  });
});
