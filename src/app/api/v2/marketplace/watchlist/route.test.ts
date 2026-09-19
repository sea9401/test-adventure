import { beforeEach, expect, it, vi } from "vitest";
const { store, session, insert } = vi.hoisted(() => ({ store: new Map<string, unknown>(), session: { user: "one" as string | null }, insert: vi.fn() }));
vi.mock("@/db", () => ({ db: { transaction: async (fn: (tx: unknown) => unknown) => fn({ insert }) } }));
vi.mock("@/lib/server/ensureUser", () => ({ ensureUser: async () => session.user }));
vi.mock("@/lib/server/userRateLimit", () => ({ enforceUserAndIpRateLimit: () => null }));
vi.mock("@/lib/server/savesKv", () => ({
  readSave: async (_tx: unknown, user: string, key: string, fallback: unknown) => store.get(user + key) ?? fallback,
  lockSaveForUpdate: async (_tx: unknown, user: string, key: string, fallback: unknown) => store.get(user + key) ?? fallback,
  upsertSave: async (_tx: unknown, user: string, key: string, value: unknown) => { store.set(user + key, value); },
}));
import { GET, PATCH } from "./route";
const req = (body?: unknown) => new Request("http://test/api/v2/marketplace/watchlist", { method: body ? "PATCH" : "GET", ...(body ? { body: JSON.stringify(body) } : {}) });
const patch = async (body: unknown) => PATCH(req(body));
const ids = async () => (await (await GET(req())).json()).ids;
beforeEach(() => { store.clear(); session.user = "one"; insert.mockReturnValue({ values: () => ({ onConflictDoNothing: async () => {} }) }); });
it("같은 계정의 추가를 보존하고 다른 계정에서는 보이지 않는다", async () => {
  await patch({ action: "add", id: 1 });
  await patch({ action: "add", id: 2 });
  await patch({ action: "add", id: 1 });
  expect(await ids()).toEqual([1, 2]);
  session.user = "two";
  expect(await ids()).toEqual([]);
  session.user = "one";
  await patch({ action: "remove", id: 1 });
  expect(await ids()).toEqual([2]);
  await patch({ action: "clear" });
  expect(await ids()).toEqual([]);
});
it("가져오기는 기존 목록과 합치고 200개 초과 시 기존 목록을 보존한다", async () => {
  await patch({ action: "add", id: 1 });
  await patch({ action: "import", ids: [1, 2] });
  expect(await ids()).toEqual([1, 2]);
  await patch({ action: "import", ids: Array.from({ length: 200 }, (_, i) => i + 1) });
  expect((await patch({ action: "add", id: 201 })).status).toBe(400);
  expect(await ids()).toHaveLength(200);
});
it("인증 및 등록 번호 검증", async () => {
  for (const id of [0, -1, 1.5, "1", 2147483648, null]) expect((await patch({ action: "add", id })).status).toBe(400);
  expect((await patch({ action: "import", ids: [1, "2"] })).status).toBe(400);
  session.user = null;
  expect((await GET(req())).status).toBe(401);
  expect((await patch({ action: "clear" })).status).toBe(401);
});
