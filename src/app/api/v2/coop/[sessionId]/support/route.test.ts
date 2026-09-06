import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  session: null as Record<string, unknown> | null,
  updated: null as Record<string, unknown> | null,
}));
vi.mock("@/lib/server/ensureUser", () => ({ ensureUser: async () => "owner" }));
vi.mock("@/db", () => ({
  db: {
    transaction: async (run: (tx: unknown) => unknown) => {
      const query = {
        from: () => query,
        where: () => query,
        for: async () => (state.session ? [state.session] : []),
      };
      return run({
        select: () => query,
        update: () => ({
          set: (value: Record<string, unknown>) => ({
            where: async () => {
              state.updated = value;
            },
          }),
        }),
      });
    },
  },
}));
import { POST } from "./route";
const ctx = { params: Promise.resolve({ sessionId: "boss" }) };
function request(value: unknown) {
  return new Request("http://test/api/v2/coop/boss/support", {
    method: "POST",
    body: JSON.stringify({ allowFreeSupport: value }),
  });
}
describe("소환자 무료 지원 설정", () => {
  beforeEach(() => {
    state.updated = null;
    state.session = {
      id: "boss",
      summonerId: "owner",
      hp: 10,
      defeatedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      allowFreeSupport: false,
      visibility: "public",
    };
  });
  it.each([true, false])(
    "전체 공개 뒤에도 지원 허용을 %s로 변경한다",
    async (value) => {
      const response = await POST(request(value), ctx);
      expect(response.status).toBe(200);
      expect(state.updated).toEqual({ allowFreeSupport: value });
    },
  );
  it("소환자가 아니면 설정을 바꿀 수 없다", async () => {
    state.session!.summonerId = "other";
    expect((await POST(request(true), ctx)).status).toBe(403);
    expect(state.updated).toBeNull();
  });
  it.each([{ hp: 0, defeatedAt: new Date() }, { expiresAt: new Date(0) }])(
    "끝난 토벌은 변경하지 않는다",
    async (ended) => {
      Object.assign(state.session!, ended);
      expect((await POST(request(true), ctx)).status).toBe(409);
      expect(state.updated).toBeNull();
    },
  );
  it.each(["true", null, 1])("boolean이 아닌 %s를 거부한다", async (value) => {
    expect((await POST(request(value), ctx)).status).toBe(400);
    expect(state.updated).toBeNull();
  });
  it("없는 세션은 404", async () => {
    state.session = null;
    expect((await POST(request(true), ctx)).status).toBe(404);
  });
});
