// 재련 라우트(POST /api/v2/me/reforge) 통합 테스트 — in-memory savesKv 스토어 위에서
// end-to-end. 굴림은 Math.random 모킹으로 결정화. enhanceRoute.test 와 동일 패턴.

import { afterEach, describe, expect, it, vi } from "vitest";

const { store } = vi.hoisted(() => ({ store: new Map<string, unknown>() }));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-test"),
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
  upsertSave: vi.fn(async (_tx, _uid, key: string, value: unknown) => {
    store.set(key, value);
  }),
}));

import { POST } from "@/app/api/v2/me/reforge/route";
import {
  V2_EQUIPMENT,
  type V2EquipmentId,
} from "@/adventure/data/v2/v2Equipment";
import {
  reforgeGoldCost,
  rollItemStats,
} from "@/adventure/data/v2/v2EquipVariance";

const WEAPON = "v2_den_greatsword" as V2EquipmentId; // 흔한(noDrop normal) — 유니크 배수 없음
const ITEM = V2_EQUIPMENT[WEAPON];
const COST = reforgeGoldCost(ITEM);

function req(body: Record<string, unknown>): Request {
  return new Request("http://t/api/v2/me/reforge", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function seed(over?: { gold?: number; roll?: unknown; hasRoll?: boolean }) {
  store.clear();
  store.set("character.v2", { gold: over?.gold ?? 10_000_000 });
  const inst: Record<string, unknown> = { iid: "w1", id: WEAPON };
  if (over?.hasRoll !== false) {
    inst.roll = over?.roll ?? { power: 300, weight: 5 };
  }
  store.set("equipment.v2", {
    owned: [inst],
    equipped: { weapon: "w1" },
  });
}

afterEach(() => vi.restoreAllMocks());

describe("POST /api/v2/me/reforge", () => {
  it("성공 — 골드 차감 + 굴림 교체(장착 유지)", async () => {
    seed({ gold: 10_000_000 });
    vi.spyOn(Math, "random").mockReturnValue(0); // 결정적: 최저 굴림
    const res = await POST(req({ iid: "w1" }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.goldCost).toBe(COST);
    expect(json.gold).toBe(10_000_000 - COST);

    const expectRoll = rollItemStats(ITEM, () => 0);
    const eq = store.get("equipment.v2") as {
      owned: { roll: unknown }[];
      equipped: unknown;
    };
    expect(eq.owned[0].roll).toEqual(expectRoll); // 굴림 교체
    expect(json.newRoll).toEqual(expectRoll);
    expect(eq.equipped).toEqual({ weapon: "w1" }); // 장착 유지
  });

  it("골드 부족 — 400, 세이브·골드 불변", async () => {
    seed({ gold: 10 });
    const before = JSON.stringify(store.get("equipment.v2"));
    const res = await POST(req({ iid: "w1" }));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toBe("insufficient_gold");
    expect(JSON.stringify(store.get("equipment.v2"))).toBe(before); // 굴림 불변
    expect((store.get("character.v2") as { gold: number }).gold).toBe(10); // 차감 없음
  });

  it("굴림 없는 개체(상점 정가) — not_reforgeable", async () => {
    seed({ hasRoll: false });
    const res = await POST(req({ iid: "w1" }));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toBe("not_reforgeable");
  });

  it("미보유 iid — 404", async () => {
    seed();
    const res = await POST(req({ iid: "nope" }));
    const json = await res.json();
    expect(res.status).toBe(404);
    expect(json.error).toBe("not_owned");
  });
});
