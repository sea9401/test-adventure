import { beforeEach, describe, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({
  userId: "user" as string | null,
  character: {} as Record<string, unknown> | null,
  lockSave: vi.fn(), upsert: vi.fn(), limit: vi.fn(),
}));
vi.mock("@/db", () => ({ db: { transaction: async (fn: (tx: object) => Promise<unknown>) => fn({}) } }));
vi.mock("@/lib/server/ensureUser", () => ({ ensureUser: async () => fixture.userId }));
vi.mock("@/lib/server/userRateLimit", () => ({ enforceUserAndIpRateLimit: fixture.limit }));
vi.mock("@/lib/server/savesKv", () => ({
  readSave: async () => fixture.character,
  lockSaveForUpdate: fixture.lockSave,
  upsertSave: fixture.upsert,
}));
import { GET, POST } from "./route";
const post = (body: unknown) => POST(new Request("http://test/api/v2/emblems", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  fixture.userId = "user";
  fixture.character = { level: 100, gold: 42, emblems: { revision: 0, slots: ["a", null, null, null], owned: [{ iid: "a", kind: "hp", grade: 1 }, { iid: "b", kind: "hp", grade: 1 }] } };
  fixture.lockSave.mockImplementation(async () => fixture.character);
  fixture.upsert.mockImplementation(async (_tx, _user, _key, value) => { fixture.character = value; });
  fixture.limit.mockReturnValue(null);
});

describe("emblem route", () => {
  it("rejects unauthenticated reads and writes", async () => {
    fixture.userId = null;
    expect((await GET()).status).toBe(401);
    expect((await post({ action: "equip" })).status).toBe(401);
    expect(fixture.upsert).not.toHaveBeenCalled();
  });
  it("reads four slots without awarding retroactive growth", async () => {
    const response = await GET();
    expect((await response.json()).emblems.slots).toEqual(["a", null, null, null]);
    expect(fixture.upsert).not.toHaveBeenCalled();
  });
  it("changes only the authoritative inventory after locking the character", async () => {
    const response = await post({ action: "equip", iid: "b", slot: 1, expectedRevision: 0 });
    expect(response.status).toBe(200);
    expect(fixture.lockSave).toHaveBeenCalledWith(expect.anything(), "user", "character.v2", null);
    expect(fixture.character).toMatchObject({ level: 100, gold: 42, emblems: { slots: ["a", "b", null, null], revision: 1 } });
    const replay = await post({ action: "equip", iid: "b", slot: 1, expectedRevision: 0 });
    expect(replay.status).toBe(409);
    expect(fixture.upsert).toHaveBeenCalledTimes(1);
  });
  it("does not accept arbitrary awarded items, invalid bodies, or absent characters", async () => {
    expect((await post({ action: "grant", owned: [{ iid: "forged", kind: "hp", grade: 5 }], expectedRevision: 0 })).status).toBe(400);
    expect((await post(null)).status).toBe(400);
    fixture.character = null;
    expect((await post({ action: "equip", iid: "a", slot: 0, expectedRevision: 0 })).status).toBe(404);
    expect(fixture.upsert).not.toHaveBeenCalled();
  });
  it("honors rate limits before starting a transaction", async () => {
    fixture.limit.mockReturnValue(Response.json({ error: "rate_limited" }, { status: 429 }));
    expect((await post({ action: "unequip", slot: 0, expectedRevision: 0 })).status).toBe(429);
    expect(fixture.lockSave).not.toHaveBeenCalled();
  });
});
