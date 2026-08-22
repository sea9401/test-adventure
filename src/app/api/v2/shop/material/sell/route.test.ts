import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  saves: new Map<string, unknown>(),
  requireTradeParticipants: vi.fn(),
  recordEconomyEventSoon: vi.fn(),
  upsertSave: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: object) => unknown) => callback({})),
  },
}));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-material-sell"),
}));
vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: vi.fn(() => null),
}));
vi.mock("@/lib/server/economyLog", () => ({
  recordEconomyEventSoon: mocks.recordEconomyEventSoon,
}));
vi.mock("@/lib/server/tradeSuspension", () => ({
  requireTradeParticipants: mocks.requireTradeParticipants,
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(
    async (_tx: object, _userId: string, key: string, fallback: unknown) =>
      mocks.saves.get(key) ?? fallback,
  ),
  upsertSave: mocks.upsertSave,
}));

import {
  dangerousBossMaterialId,
  dangerousCatchMaterialId,
} from "@/adventure/data/v2/dangerousFishing";
import { POST } from "./route";

const MATERIAL_ID = dangerousCatchMaterialId("ironjaw_tuna");
const BOSS_MATERIAL_ID = dangerousBossMaterialId("tidal_colossus");

function sell(body: unknown) {
  return POST(
    new Request("http://localhost/api/v2/shop/material/sell", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.upsertSave.mockImplementation(
    async (_tx: object, _userId: string, key: string, value: unknown) => {
      mocks.saves.set(key, value);
    },
  );
  mocks.saves.clear();
  mocks.saves.set("character.v2", {
    gold: 100,
    bankedGold: 200,
    materials: { [MATERIAL_ID]: 3, [BOSS_MATERIAL_ID]: 4 },
  });
});

describe("POST /api/v2/shop/material/sell", () => {
  it("재료 판매 대금을 소지금이 아닌 은행에 적립한다", async () => {
    const response = await sell({ id: MATERIAL_ID, amount: 2 });
    const json = (await response.json()) as {
      gold: number;
      bankedGold: number;
      materials: Record<string, number>;
      sold: { count: number; gold: number };
    };

    expect(response.status).toBe(200);
    expect(json.sold).toEqual({ id: MATERIAL_ID, count: 2, gold: 4_200 });
    expect(json.gold).toBe(100);
    expect(json.bankedGold).toBe(4_400);
    expect(json.materials[MATERIAL_ID]).toBe(1);
    expect(mocks.saves.get("character.v2")).toMatchObject({
      gold: 100,
      bankedGold: 4_400,
    });
  });

  it("0 이하는 거부하고 소수는 내림하며 보유량 초과는 전량으로 제한한다", async () => {
    const zero = await sell({ id: MATERIAL_ID, amount: 0 });
    expect(zero.status).toBe(400);
    expect(await zero.json()).toMatchObject({ error: "invalid_amount" });

    const fractional = await sell({ id: MATERIAL_ID, amount: 2.9 });
    expect(fractional.status).toBe(200);
    expect(await fractional.json()).toMatchObject({
      sold: { id: MATERIAL_ID, count: 2, gold: 4_200 },
      materials: { [MATERIAL_ID]: 1 },
    });

    mocks.saves.set("character.v2", {
      gold: 100,
      bankedGold: 200,
      materials: { [MATERIAL_ID]: 3 },
    });
    const tooLarge = await sell({ id: MATERIAL_ID, amount: 99 });
    expect(tooLarge.status).toBe(200);
    expect(await tooLarge.json()).toMatchObject({
      sold: { id: MATERIAL_ID, count: 3, gold: 6_300 },
      materials: {},
    });
  });

  it("거대어 증표는 NPC 판매를 거부하고 보유 상태를 바꾸지 않는다", async () => {
    const before = structuredClone(mocks.saves.get("character.v2"));
    const response = await sell({ id: BOSS_MATERIAL_ID, amount: 1 });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "not_sellable" });
    expect(mocks.saves.get("character.v2")).toEqual(before);
  });

  it("플레이어 간 거래 제한과 무관한 NPC 판매 정책을 유지한다", async () => {
    mocks.requireTradeParticipants.mockRejectedValue(new Error("trade_suspended"));

    const response = await sell({ id: MATERIAL_ID, amount: 1 });

    expect(response.status).toBe(200);
    expect(mocks.requireTradeParticipants).not.toHaveBeenCalled();
  });

  it("위험 어획물 보유량이 안전 정수가 아니면 판매·차감·기록을 모두 거부한다", async () => {
    mocks.saves.set("character.v2", {
      gold: 100,
      bankedGold: 200,
      materials: { [MATERIAL_ID]: Number.MAX_VALUE },
    });
    const before = structuredClone(mocks.saves.get("character.v2"));

    const response = await sell({ id: MATERIAL_ID });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: "unsafe_material_balance",
    });
    expect(mocks.saves.get("character.v2")).toEqual(before);
    expect(mocks.recordEconomyEventSoon).not.toHaveBeenCalled();
    expect(mocks.upsertSave).not.toHaveBeenCalled();
  });

  it("관련 없는 재료가 안전 정수가 아니어도 정상 어획물 판매로 조용히 삭제하지 않는다", async () => {
    mocks.saves.set("character.v2", {
      gold: 100,
      bankedGold: 200,
      materials: {
        [MATERIAL_ID]: 3,
        unrelated_corrupt_material: Number.MAX_VALUE,
      },
    });
    const before = structuredClone(mocks.saves.get("character.v2"));

    const response = await sell({ id: MATERIAL_ID, amount: 1 });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: "unsafe_material_balance",
    });
    expect(mocks.saves.get("character.v2")).toEqual(before);
    expect(mocks.recordEconomyEventSoon).not.toHaveBeenCalled();
    expect(mocks.upsertSave).not.toHaveBeenCalled();
  });

  it("위험 어획물 판매 대금 곱셈이 안전 정수를 넘으면 완전 무변경으로 거부한다", async () => {
    mocks.saves.set("character.v2", {
      gold: 100,
      bankedGold: 200,
      materials: { [MATERIAL_ID]: Number.MAX_SAFE_INTEGER },
    });
    const before = structuredClone(mocks.saves.get("character.v2"));

    const response = await sell({
      id: MATERIAL_ID,
      amount: Number.MAX_SAFE_INTEGER,
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: "sale_overflow",
    });
    expect(mocks.saves.get("character.v2")).toEqual(before);
    expect(mocks.recordEconomyEventSoon).not.toHaveBeenCalled();
  });

  it("은행 잔액 합산이 안전 정수를 넘으면 재료를 먼저 차감하지 않는다", async () => {
    mocks.saves.set("character.v2", {
      gold: 100,
      bankedGold: Number.MAX_SAFE_INTEGER,
      materials: { [MATERIAL_ID]: 1 },
    });
    const before = structuredClone(mocks.saves.get("character.v2"));

    const response = await sell({ id: MATERIAL_ID, amount: 1 });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: "sale_overflow",
    });
    expect(mocks.saves.get("character.v2")).toEqual(before);
    expect(mocks.recordEconomyEventSoon).not.toHaveBeenCalled();
  });

  it.each(["gold", "bankedGold"] as const)(
    "%s 잔액이 안전 정수가 아니면 판매·차감·기록을 모두 거부한다",
    async (balanceKey) => {
      mocks.saves.set("character.v2", {
        gold: 100,
        bankedGold: 200,
        [balanceKey]: Number.MAX_VALUE,
        materials: { [MATERIAL_ID]: 1 },
      });
      const before = structuredClone(mocks.saves.get("character.v2"));

      const response = await sell({ id: MATERIAL_ID, amount: 1 });

      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        ok: false,
        error: "unsafe_balance",
      });
      expect(mocks.saves.get("character.v2")).toEqual(before);
      expect(mocks.recordEconomyEventSoon).not.toHaveBeenCalled();
    },
  );

  it("요청 수량이 안전 정수가 아니면 판매·차감·기록을 모두 거부한다", async () => {
    const before = structuredClone(mocks.saves.get("character.v2"));

    const response = await sell({ id: MATERIAL_ID, amount: Number.MAX_VALUE });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: "invalid_amount",
    });
    expect(mocks.saves.get("character.v2")).toEqual(before);
    expect(mocks.recordEconomyEventSoon).not.toHaveBeenCalled();
  });
});
