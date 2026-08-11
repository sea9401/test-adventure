import { beforeEach, describe, expect, it, vi } from "vitest";
import { FISH_IDS } from "@/adventure/data/v2/fish";
import {
  emptyFishCodex,
  registerFishSpecimen,
} from "@/adventure/v2/fishingCodex";
import {
  V2_SKILLS,
  spCostOf,
  type V2SkillId,
} from "@/adventure/data/v2/v2Skills";

const mocks = vi.hoisted(() => ({
  userId: "u-test" as string | null,
  store: new Map<string, unknown>(),
  transactionTail: Promise.resolve() as Promise<unknown>,
  recordEconomyEventSoon: vi.fn(),
}));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => mocks.userId),
}));
vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
      const previous = mocks.transactionTail;
      let release = () => {};
      mocks.transactionTail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        return await callback({});
      } finally {
        release();
      }
    }),
  },
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(async (_tx, _userId, key: string, fallback: unknown) =>
    mocks.store.has(key) ? mocks.store.get(key) : fallback,
  ),
  readSave: vi.fn(async (_tx, _userId, key: string, fallback: unknown) =>
    mocks.store.has(key) ? mocks.store.get(key) : fallback,
  ),
  upsertSave: vi.fn(async (_tx, _userId, key: string, value: unknown) => {
    mocks.store.set(key, value);
  }),
}));
vi.mock("@/lib/server/economyLog", () => ({
  recordEconomyEventSoon: mocks.recordEconomyEventSoon,
}));
vi.mock("@/lib/server/jobUnlockContext", () => ({
  readJobUnlockContext: vi.fn(async () => ({})),
}));

import { POST } from "./route";

function request(body: Record<string, unknown>) {
  return new Request("https://game.test/api/v2/me/fishing-specimens/extract", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function firstFiveRegistered() {
  let codex = emptyFishCodex();
  for (const fishId of FISH_IDS.slice(0, 5)) {
    codex = registerFishSpecimen(codex, fishId).codex;
  }
  return codex;
}

function equippedSkillsAtCost(target: number): V2SkillId[] {
  const candidates = Object.keys(V2_SKILLS) as V2SkillId[];
  const paths = new Map<number, V2SkillId[]>([[0, []]]);
  for (const id of candidates) {
    const cost = spCostOf(V2_SKILLS[id]);
    for (const [sum, path] of [...paths.entries()].sort((a, b) => b[0] - a[0])) {
      const next = sum + cost;
      if (next <= target && !paths.has(next)) paths.set(next, [...path, id]);
    }
  }
  const result = paths.get(target);
  if (!result) throw new Error(`cannot build skill loadout at cost ${target}`);
  return result;
}

describe("POST /api/v2/me/fishing-specimens/extract", () => {
  beforeEach(() => {
    mocks.userId = "u-test";
    mocks.store.clear();
    mocks.transactionTail = Promise.resolve();
    mocks.recordEconomyEventSoon.mockClear();
    mocks.store.set("character.v2", {});
    mocks.store.set("skills.v2", { learned: [], equipped: [] });
    mocks.store.set("proficiency.v2", {});
    mocks.store.set("equipment-codex.v1", {});
    mocks.store.set("fishing-codex.v1", firstFiveRegistered());
    mocks.store.set("fishing-specimens.v1", { version: 1, items: {} });
  });

  it("SP가 줄면 현재 서버 값으로 재확인을 요구하고 아직 상태를 바꾸지 않는다", async () => {
    const response = await POST(request({ fishId: FISH_IDS[0] }));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: "sp_confirmation_required",
      fishSpBefore: 1,
      fishSpAfter: 0,
      totalSpBefore: 45,
      totalSpAfter: 44,
      spLoss: 1,
    });
    expect(mocks.store.get("fishing-specimens.v1")).toEqual({ version: 1, items: {} });
  });

  it("SP가 줄지 않는 추출도 preview 요청에서는 확인 전에 상태를 바꾸지 않는다", async () => {
    let codex = firstFiveRegistered();
    codex = registerFishSpecimen(codex, FISH_IDS[5]).codex;
    mocks.store.set("fishing-codex.v1", codex);

    const response = await POST(request({ fishId: FISH_IDS[0], preview: true }));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: "confirmation_required",
      fishSpBefore: 1,
      fishSpAfter: 1,
      spLoss: 0,
    });
    expect(mocks.store.get("fishing-specimens.v1")).toEqual({ version: 1, items: {} });
  });

  it("정확한 SP 확인값을 보내면 등록권을 표본 한 개로 추출한다", async () => {
    const response = await POST(
      request({
        fishId: FISH_IDS[0],
        confirmed: {
          fishSpBefore: 1,
          fishSpAfter: 0,
          totalSpBefore: 45,
          totalSpAfter: 44,
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      fishId: FISH_IDS[0],
      specimenBalance: 1,
      registered: false,
      totalSpAfter: 44,
    });
    expect(mocks.store.get("fishing-specimens.v1")).toMatchObject({
      items: { [FISH_IDS[0]]: 1 },
    });
    expect(mocks.recordEconomyEventSoon).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u-test",
        eventType: "fish_specimen.extract",
        quantity: 1,
      }),
    );
  });

  it("확인 뒤 서버 값이 달라졌으면 새 값을 주고 다시 확인시킨다", async () => {
    const response = await POST(
      request({
        fishId: FISH_IDS[0],
        confirmed: {
          fishSpBefore: 2,
          fishSpAfter: 1,
          totalSpBefore: 42,
          totalSpAfter: 41,
        },
      }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: "stale_confirmation",
      fishSpBefore: 1,
      fishSpAfter: 0,
      totalSpBefore: 45,
      totalSpAfter: 44,
    });
    expect(mocks.store.get("fishing-specimens.v1")).toEqual({ version: 1, items: {} });
  });

  it("추출 뒤 장착 스킬 비용이 새 한도를 넘으면 상태 변경 없이 차단한다", async () => {
    const equipped = equippedSkillsAtCost(45);
    mocks.store.set("skills.v2", { learned: equipped, equipped });

    const response = await POST(request({ fishId: FISH_IDS[0] }));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: "loadout_over_budget",
      equippedSpUsed: 45,
      totalSpAfter: 44,
      overBudget: true,
    });
    expect(mocks.store.get("fishing-specimens.v1")).toEqual({ version: 1, items: {} });
  });

  it("미등록 어종과 잘못된 어종 ID를 거부한다", async () => {
    const missing = await POST(request({ fishId: FISH_IDS[10] }));
    expect(missing.status).toBe(400);
    expect(await missing.json()).toMatchObject({ error: "not_registered" });

    const invalid = await POST(request({ fishId: "not_a_fish" }));
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ error: "invalid_fish_id" });
  });

  it("동일한 확인 요청이 동시에 와도 표본은 한 개만 만든다", async () => {
    const body = {
      fishId: FISH_IDS[0],
      confirmed: {
        fishSpBefore: 1,
        fishSpAfter: 0,
        totalSpBefore: 45,
        totalSpAfter: 44,
      },
    };
    const responses = await Promise.all([POST(request(body)), POST(request(body))]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 400]);
    expect(mocks.store.get("fishing-specimens.v1")).toMatchObject({
      items: { [FISH_IDS[0]]: 1 },
    });
  });
});
