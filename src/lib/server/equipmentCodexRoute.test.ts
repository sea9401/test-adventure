import { beforeEach, describe, expect, it, vi } from "vitest";

const { grantTitleIfMissingInTx, store } = vi.hoisted(() => ({
  grantTitleIfMissingInTx: vi.fn(async () => true),
  store: new Map<string, unknown>(),
}));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-test"),
}));

vi.mock("@/lib/server/grantTitle", () => ({
  grantTitleIfMissingInTx,
}));

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb({})),
  },
}));

vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(async (_tx, _uid, key: string, fallback: unknown) =>
    store.has(key) ? store.get(key) : fallback,
  ),
  readSave: vi.fn(async (_tx, _uid, key: string, fallback: unknown) =>
    store.has(key) ? store.get(key) : fallback,
  ),
  upsertSave: vi.fn(async (_tx, _uid, key: string, value: unknown) => {
    store.set(key, value);
  }),
}));

import { POST } from "@/app/api/v2/me/equipment-codex/route";

function req(body: Record<string, unknown>): Request {
  return new Request("http://t/api/v2/me/equipment-codex", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function seed() {
  store.clear();
  store.set("equipment.v2", {
    owned: [
      { iid: "plain", id: "v2_iron_sword", roll: { power: 10, weight: 1 } },
      { iid: "locked", id: "v2_greatsword", locked: true },
      { iid: "equipped", id: "v2_wooden_bow" },
    ],
    equipped: { weapon: "equipped" },
  });
  store.set("equipment-codex.v1", {});
}

describe("POST /api/v2/me/equipment-codex", () => {
  beforeEach(() => {
    seed();
    grantTitleIfMissingInTx.mockClear();
  });

  it("보유한 미장착/미잠금 장비 1개를 소비하고 카탈로그 id를 등록한다", async () => {
    const res = await POST(req({ iid: "plain" }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      registeredIds: string[];
      consumedItemId: string;
      owned: Array<{ iid: string; id: string }>;
    };
    expect(json.consumedItemId).toBe("v2_iron_sword");
    expect(json.registeredIds).toEqual(["v2_iron_sword"]);
    expect(json.owned.some((item) => item.iid === "plain")).toBe(false);
    expect(store.get("equipment-codex.v1")).toEqual({
      registeredIds: ["v2_iron_sword"],
    });
  });

  it("잠금 장비는 등록하지 않는다", async () => {
    const res = await POST(req({ iid: "locked" }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("locked");
  });

  it("장착 중인 장비는 등록하지 않는다", async () => {
    const res = await POST(req({ iid: "equipped" }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("equipped");
  });

  it("이미 등록된 장비 id는 다른 개체가 있어도 다시 등록하지 않는다", async () => {
    store.set("equipment.v2", {
      owned: [
        { iid: "first", id: "v2_iron_sword" },
        { iid: "second", id: "v2_iron_sword" },
      ],
      equipped: {},
    });
    store.set("equipment-codex.v1", { registeredIds: ["v2_iron_sword"] });

    const res = await POST(req({ iid: "second" }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe(
      "already_registered",
    );
    const equipment = store.get("equipment.v2") as {
      owned: Array<{ iid: string }>;
    };
    expect(equipment.owned.map((item) => item.iid)).toEqual(["first", "second"]);
  });

  it("제작 전용 장비 도감 단계 달성 시 칭호를 지급한다", async () => {
    store.set("equipment.v2", {
      owned: [{ iid: "craft-only", id: "v2_crafted_master_ring" }],
      equipped: {},
    });
    store.set("equipment-codex.v1", {
      registeredIds: [
        "v2_crafted_oathblade",
        "v2_crafted_gale_bow",
        "v2_crafted_runic_staff",
      ],
    });

    const res = await POST(req({ iid: "craft-only" }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      grantedTitles: string[];
      registeredIds: string[];
    };
    expect(json.registeredIds).toHaveLength(4);
    expect(json.registeredIds).toEqual(
      expect.arrayContaining([
        "v2_crafted_oathblade",
        "v2_crafted_gale_bow",
        "v2_crafted_runic_staff",
        "v2_crafted_master_ring",
      ]),
    );
    expect(json.grantedTitles).toEqual(["artisan_codex_collector"]);
    expect(grantTitleIfMissingInTx).toHaveBeenCalledWith(
      {},
      "u-test",
      "artisan_codex_collector",
      expect.any(Number),
    );
  });
});
