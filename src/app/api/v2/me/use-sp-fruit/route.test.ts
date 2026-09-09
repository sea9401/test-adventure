import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  character: {} as Record<string, unknown>,
}));
vi.mock("@/db", () => ({ db: { transaction: async (fn: (tx: unknown) => unknown) => fn({}) } }));
vi.mock("@/lib/server/ensureUser", () => ({ ensureUser: async () => "fruit-user" }));
vi.mock("@/lib/server/userRateLimit", () => ({ enforceUserAndIpRateLimit: () => null }));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: async () => structuredClone(state.character),
  readSave: async (_tx: unknown, _user: string, _key: string, fallback: unknown) => fallback,
  upsertSave: async (_tx: unknown, _user: string, _key: string, value: Record<string, unknown>) => {
    state.character = structuredClone(value);
  },
}));
vi.mock("@/lib/server/jobUnlockContext", () => ({ readJobUnlockContext: async () => ({}) }));
vi.mock("@/lib/server/codexSpBonus", () => ({ readCodexSpBonus: async () => ({ total: 0 }) }));

import { POST } from "./route";

function useFruit(tier: number) {
  return POST(new Request("http://localhost/api/v2/me/use-sp-fruit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tier }),
  }));
}

beforeEach(() => {
  state.character = {
    class: "warrior", level: 100,
    materials: { sp_fruit_6: 2 },
    spFruitUsed: { 6: 4 },
  };
});

describe("SP 열매 VI 사용", () => {
  it("5번째 사용은 SP를 늘리고, 6번째는 남은 열매를 소모하지 않는다", async () => {
    const fifth = await useFruit(6);
    expect(fifth.status).toBe(200);
    const body = await fifth.json();
    expect(body).toMatchObject({ ok: true, tier: 6, used: { 6: 5 }, capBonus: 5, materialCount: 1 });
    expect(state.character).toMatchObject({ materials: { sp_fruit_6: 1 }, spFruitUsed: { 6: 5 } });
    const saved = structuredClone(state.character);

    const sixth = await useFruit(6);
    expect(sixth.status).toBe(400);
    expect(await sixth.json()).toEqual({ ok: false, error: "use_cap_reached" });
    expect(state.character).toEqual(saved);
  });

  it("기존 저장에 VI 기록이 없으면 첫 사용부터 누적하고 SP 예산을 1 늘린다", async () => {
    state.character.spFruitUsed = { 1: 3, 5: 3 };
    const first = await (await useFruit(6)).json();
    const second = await (await useFruit(6)).json();
    expect(first).toMatchObject({ used: { 1: 3, 5: 3, 6: 1 }, capBonus: 7 });
    expect(second.spBudget).toBe(first.spBudget + 1);
    expect(second.materialCount).toBe(0);
  });

  it("보유하지 않은 VI는 사용할 수 없다", async () => {
    state.character.materials = {};
    const response = await useFruit(6);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "no_fruit" });
  });
});
