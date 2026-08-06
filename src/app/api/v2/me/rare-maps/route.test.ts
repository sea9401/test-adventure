import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  saves: new Map<string, unknown>(),
}));

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: object) => unknown) => callback({})),
  },
}));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-rare-map"),
}));
vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: vi.fn(() => null),
}));
vi.mock("@/lib/server/savesKv", () => ({
  readSave: vi.fn(
    async (_db: object, _userId: string, key: string, fallback: unknown) =>
      mocks.saves.get(key) ?? fallback,
  ),
  lockSaveForUpdate: vi.fn(
    async (_tx: object, _userId: string, key: string, fallback: unknown) =>
      mocks.saves.get(key) ?? fallback,
  ),
  upsertSave: vi.fn(
    async (_tx: object, _userId: string, key: string, value: unknown) => {
      mocks.saves.set(key, value);
    },
  ),
}));

import { DELETE } from "./route";
import { newRareMapInstance } from "@/adventure/data/v2/rareMaps";

function request(iid: unknown) {
  return new Request("http://localhost/api/v2/me/rare-maps", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ iid }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.saves.clear();
});

describe("DELETE /api/v2/me/rare-maps", () => {
  it("보유 지도를 iid로 한 장만 삭제한다", async () => {
    const now = Date.now();
    const kept = newRareMapInstance("gilded_map", 10, now, "rm-kept");
    const discarded = newRareMapInstance("worn_map", 20, now, "rm-discarded");
    mocks.saves.set("character.v2", {
      gold: 123,
      rareMaps: [kept, discarded],
    });

    const response = await DELETE(request(discarded.iid));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true, rareMaps: [kept] });
    expect(mocks.saves.get("character.v2")).toEqual({
      gold: 123,
      rareMaps: [kept],
    });
  });

  it("보유하지 않은 iid와 빈 iid는 저장값을 바꾸지 않는다", async () => {
    const held = newRareMapInstance("worn_map", 10, Date.now(), "rm-held");
    mocks.saves.set("character.v2", { rareMaps: [held] });

    const notOwned = await DELETE(request("rm-missing"));
    const invalid = await DELETE(request(""));

    expect(notOwned.status).toBe(404);
    expect((await notOwned.json()).error).toBe("not_owned");
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error).toBe("invalid_iid");
    expect(mocks.saves.get("character.v2")).toEqual({ rareMaps: [held] });
  });
});
