import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  saves: new Map<string, unknown>(),
  recordEconomyEventSoon: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: object) => unknown) => callback({})),
  },
}));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-bulk-sell"),
}));
vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: vi.fn(() => null),
}));
vi.mock("@/lib/server/economyLog", () => ({
  recordEconomyEventSoon: mocks.recordEconomyEventSoon,
}));
vi.mock("@/lib/server/savesKv", () => ({
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

import { POST } from "./route";
import type { V2EquipmentId } from "@/adventure/data/v2/v2Equipment";

const BOW = "v2_starsong_bow" as V2EquipmentId;

function request(belowPct: number) {
  return new Request("http://localhost/api/v2/shop/equipment/sell-bulk", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ slot: "weapon", belowPct }),
  });
}

function selectedRequest(iids: string[]) {
  return new Request("http://localhost/api/v2/shop/equipment/sell-bulk", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ iids }),
  });
}

function confirmedSelectedRequest(iids: string[]) {
  return new Request("http://localhost/api/v2/shop/equipment/sell-bulk", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ iids, confirmBound: true }),
  });
}

function rawRequest(body: unknown) {
  return new Request("http://localhost/api/v2/shop/equipment/sell-bulk", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.saves.clear();
  mocks.saves.set("character.v2", { gold: 100, bankedGold: 200 });
  mocks.saves.set("equipment.v2", {
    owned: [
      {
        iid: "low",
        id: BOW,
        roll: { power: 27, weight: 0, options: { crit: 1 } },
      },
      {
        iid: "high",
        id: BOW,
        roll: { power: 129, weight: 0, options: { crit: 3 } },
      },
      { iid: "fixed", id: BOW },
      {
        iid: "locked-low",
        id: BOW,
        roll: { power: 27, weight: 0, options: { crit: 1 } },
        locked: true,
      },
    ],
    equipped: {},
  });
});

describe("POST /api/v2/shop/equipment/sell-bulk", () => {
  it("기준 품질 이하 장비만 판매하고 고품질·고정품질·잠금 장비는 보존한다", async () => {
    const response = await POST(request(40));
    const json = (await response.json()) as {
      soldCount: number;
      soldGold: number;
      owned: { iid: string }[];
      gold: number;
      bankedGold: number;
    };

    expect(response.status).toBe(200);
    expect(json.soldCount).toBe(1);
    expect(json.soldGold).toBeGreaterThan(0);
    expect(json.owned.map((item) => item.iid)).toEqual([
      "high",
      "fixed",
      "locked-low",
    ]);
    expect(json.gold).toBe(100);
    expect(json.bankedGold).toBe(200 + json.soldGold);
    expect(mocks.saves.get("character.v2")).toMatchObject({
      gold: 100,
      bankedGold: 200 + json.soldGold,
    });
    expect(mocks.recordEconomyEventSoon).toHaveBeenCalledOnce();
  });

  it("100% 경계값도 이하 판매 대상에 포함한다", async () => {
    const response = await POST(request(100));
    const json = (await response.json()) as {
      soldCount: number;
      owned: { iid: string }[];
    };

    expect(response.status).toBe(200);
    expect(json.soldCount).toBe(2);
    expect(json.owned.map((item) => item.iid)).toEqual([
      "fixed",
      "locked-low",
    ]);
  });

  it("선택한 iid만 판매하고 대금을 은행에 입금한다", async () => {
    const response = await POST(selectedRequest(["high", "fixed"]));
    const json = (await response.json()) as {
      soldCount: number;
      soldGold: number;
      owned: { iid: string }[];
      gold: number;
      bankedGold: number;
    };

    expect(response.status).toBe(200);
    expect(json.soldCount).toBe(2);
    expect(json.owned.map((item) => item.iid)).toEqual(["low", "locked-low"]);
    expect(json.gold).toBe(100);
    expect(json.bankedGold).toBe(200 + json.soldGold);
  });

  it("선택 중 하나가 잠겼으면 부분 판매하지 않고 최신 장비를 돌려준다", async () => {
    const response = await POST(selectedRequest(["low", "locked-low"]));
    const json = (await response.json()) as {
      error: string;
      owned: { iid: string }[];
    };

    expect(response.status).toBe(409);
    expect(json.error).toBe("selection_changed");
    expect(json.owned.map((item) => item.iid)).toEqual([
      "low",
      "high",
      "fixed",
      "locked-low",
    ]);
    expect(mocks.saves.get("character.v2")).toEqual({
      gold: 100,
      bankedGold: 200,
    });
  });

  it("빈 선택과 중복 iid 요청을 거절한다", async () => {
    const empty = await POST(selectedRequest([]));
    const duplicate = await POST(selectedRequest(["low", "low"]));

    expect(empty.status).toBe(400);
    expect(duplicate.status).toBe(400);
  });

  it("객체가 아닌 JSON 본문을 400으로 거절한다", async () => {
    const response = await POST(rawRequest(null));

    expect(response.status).toBe(400);
  });

  it("자동 일괄 판매는 조건에 맞는 해방 귀속 장비를 건너뛴다", async () => {
    const current = mocks.saves.get("equipment.v2") as {
      owned: Array<Record<string, unknown>>;
      equipped: Record<string, string>;
    };
    current.owned.push({
      iid: "bound-low",
      id: BOW,
      bound: true,
      roll: { power: 27, weight: 0, options: { crit: 1 } },
      liberation: {
        rank: 3,
        lineCount: 1,
        revision: 1,
        options: [{ id: "physical_attack_flat", level: 1 }],
      },
    });

    const response = await POST(request(40));
    const json = (await response.json()) as {
      soldCount: number;
      skippedBoundCount: number;
      owned: Array<{ iid: string }>;
    };
    expect(response.status).toBe(200);
    expect(json.soldCount).toBe(1);
    expect(json.skippedBoundCount).toBe(1);
    expect(json.owned.map(({ iid }) => iid)).toContain("bound-low");
  });

  it("명시적 귀속 장비 선택은 확인 전 원자적으로 거절하고 확인 후 판매한다", async () => {
    const current = mocks.saves.get("equipment.v2") as {
      owned: Array<Record<string, unknown>>;
      equipped: Record<string, string>;
    };
    current.owned.push({
      iid: "bound-explicit",
      id: BOW,
      bound: true,
      liberation: {
        rank: 3,
        lineCount: 1,
        revision: 1,
        options: [{ id: "physical_attack_flat", level: 1 }],
      },
    });

    const blocked = await POST(selectedRequest(["high", "bound-explicit"]));
    expect(blocked.status).toBe(409);
    await expect(blocked.json()).resolves.toMatchObject({
      error: "bound_confirmation_required",
      items: [{ iid: "bound-explicit", liberation: { rank: 3 } }],
    });
    expect(
      (mocks.saves.get("equipment.v2") as { owned: unknown[] }).owned,
    ).toHaveLength(5);

    const confirmed = await POST(
      confirmedSelectedRequest(["high", "bound-explicit"]),
    );
    expect(confirmed.status).toBe(200);
    expect(
      (
        mocks.saves.get("equipment.v2") as {
          owned: Array<{ iid: string }>;
        }
      ).owned.map(({ iid }) => iid),
    ).not.toContain("bound-explicit");
  });
});
