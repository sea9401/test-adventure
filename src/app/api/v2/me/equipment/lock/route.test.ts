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
  ensureUser: vi.fn(async () => "u-lock"),
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
import {
  MAX_BULK_LOCK_COUNT,
  type V2EquipInstance,
  type V2EquipmentId,
} from "@/adventure/data/v2/v2Equipment";

const SWORD = "v2_iron_sword" as V2EquipmentId;

function request(body: unknown) {
  return new Request("http://localhost/api/v2/me/equipment/lock", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function savedOwned(): V2EquipInstance[] {
  return (mocks.saves.get("equipment.v2") as { owned: V2EquipInstance[] }).owned;
}

function lockedIids(): string[] {
  return savedOwned()
    .filter((inst) => inst.locked === true)
    .map((inst) => inst.iid);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.saves.clear();
  mocks.saves.set("equipment.v2", {
    owned: [
      { iid: "a", id: SWORD },
      { iid: "b", id: SWORD, locked: true },
      { iid: "c", id: SWORD },
    ],
    equipped: { weapon: "a" },
  });
});

describe("POST /api/v2/me/equipment/lock", () => {
  it("장비 하나를 잠근다", async () => {
    const res = await POST(request({ iid: "c", locked: true }));

    expect(res.status).toBe(200);
    expect(lockedIids()).toEqual(["b", "c"]);
  });

  it("여러 장비를 한 번에 잠그고 바뀐 수를 알려 준다", async () => {
    const res = await POST(request({ iids: ["a", "b", "c"], locked: true }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.changedCount).toBe(2);
    expect(body.owned.map((inst: V2EquipInstance) => inst.locked === true)).toEqual([
      true,
      true,
      true,
    ]);
    expect(body.equipped).toEqual({ weapon: "a" });
    expect(lockedIids()).toEqual(["a", "b", "c"]);
  });

  it("여러 장비의 잠금을 한 번에 푼다", async () => {
    const res = await POST(request({ iids: ["b", "c"], locked: false }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.changedCount).toBe(1);
    expect(lockedIids()).toEqual([]);
  });

  it("그사이 사라진 장비는 건너뛰고 남은 장비만 잠근다", async () => {
    const res = await POST(request({ iids: ["gone", "c"], locked: true }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.changedCount).toBe(1);
    expect(lockedIids()).toEqual(["b", "c"]);
  });

  it("보유한 장비가 하나도 없으면 거절하고 저장하지 않는다", async () => {
    const res = await POST(request({ iids: ["gone"], locked: true }));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("not_owned");
    expect(lockedIids()).toEqual(["b"]);
  });

  it.each([
    ["빈 목록", []],
    ["문자열이 아닌 값", ["a", 3]],
    ["빈 문자열", ["a", ""]],
    ["배열이 아닌 값", "a"],
  ])("잘못된 목록(%s)은 거절한다", async (_label, iids) => {
    const res = await POST(request({ iids, locked: true }));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_iids");
    expect(lockedIids()).toEqual(["b"]);
  });

  it("한 번에 받을 수 있는 수를 넘으면 거절한다", async () => {
    const iids = Array.from({ length: MAX_BULK_LOCK_COUNT + 1 }, (_, i) => `x${i}`);
    const res = await POST(request({ iids, locked: true }));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("too_many_iids");
  });
});
