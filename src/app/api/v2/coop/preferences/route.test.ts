import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  userId: "owner" as string | null,
  saves: new Map<string, unknown>(),
}));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/server/ensureUser", () => ({ ensureUser: async () => h.userId }));
vi.mock("@/lib/server/savesKv", () => ({
  readSave: async (_db: unknown, userId: string, key: string, fallback: unknown) =>
    h.saves.get(`${userId}:${key}`) ?? fallback,
  upsertSave: async (_db: unknown, userId: string, key: string, value: unknown) => {
    h.saves.set(`${userId}:${key}`, value);
  },
}));
import { GET, POST } from "./route";

const request = (body: unknown) => new Request("http://test/api/v2/coop/preferences", {
  method: "POST", body: JSON.stringify(body),
});

describe("협동 보스 자동 지원 설정", () => {
  beforeEach(() => { h.userId = "owner"; h.saves.clear(); });
  it("미설정은 꺼짐이며 저장값을 재조회하고 계정별로 분리한다", async () => {
    expect(await (await GET()).json()).toEqual({ ok: true, autoFreeSupport: false });
    expect((await POST(request({ autoFreeSupport: true, userId: "other" }))).status).toBe(200);
    expect(await (await GET()).json()).toEqual({ ok: true, autoFreeSupport: true });
    h.userId = "other";
    expect(await (await GET()).json()).toEqual({ ok: true, autoFreeSupport: false });
    h.userId = "owner";
    await POST(request({ autoFreeSupport: false }));
    expect(await (await GET()).json()).toEqual({ ok: true, autoFreeSupport: false });
  });
  it.each([null, {}, [], { autoFreeSupport: "true" }, { autoFreeSupport: 1 }])(
    "잘못된 설정 %j는 저장하지 않는다", async (body) => {
      expect((await POST(request(body))).status).toBe(400);
      expect(h.saves.size).toBe(0);
    },
  );
  it("로그인 없이 조회하거나 변경할 수 없다", async () => {
    h.userId = null;
    expect((await GET()).status).toBe(401);
    expect((await POST(request({ autoFreeSupport: true }))).status).toBe(401);
    expect(h.saves.size).toBe(0);
  });
  it("잘못된 JSON은 거부한다", async () => {
    expect((await POST(new Request("http://test", { method: "POST", body: "{" }))).status).toBe(400);
  });
});
