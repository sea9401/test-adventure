import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CodexMasteryGameplayEvent } from "@/lib/server/codexMasteryGameplay";

const { store, recordCodexMasteryGameplayBatch } = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  recordCodexMasteryGameplayBatch: vi.fn(
    async (
      _executor: unknown,
      _userId: string,
      _events: readonly CodexMasteryGameplayEvent[],
      _now: Date,
    ) => [],
  ),
}));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-test"),
}));

vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: vi.fn(() => null),
}));

vi.mock("@/lib/server/codexMasteryGameplay", () => ({
  recordCodexMasteryGameplayBatch,
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

import { POST } from "@/app/api/v2/me/use-coop-mastery-tome/route";
import {
  COOP_MASTERY_TOME_GAIN,
  COOP_MASTERY_TOME_MATERIAL_ID,
} from "@/adventure/data/v2/coopRewards";

function req(): Request {
  return new Request("http://t/api/v2/me/use-coop-mastery-tome", {
    method: "POST",
  });
}

describe("use-coop-mastery-tome route", () => {
  beforeEach(() => {
    recordCodexMasteryGameplayBatch.mockClear();
  });

  it("현재 직업에 비급 숙련도를 지급하고 직업 도감 숙련도로 기록한다", async () => {
    store.clear();
    store.set("character.v2", {
      class: "warrior",
      materials: { [COOP_MASTERY_TOME_MATERIAL_ID]: 2 },
    });
    store.set("proficiency.v2", {
      points: 0,
      groups: { warrior: { tier: 1, cultivations: 0, cumLevel: 10 } },
      jobCumLevel: { warrior: 10 },
      caps: {},
      grown: {},
    });

    const res = await POST(req());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      gained: COOP_MASTERY_TOME_GAIN,
      jobId: "warrior",
      remaining: 1,
    });
    expect(recordCodexMasteryGameplayBatch).toHaveBeenCalledWith(
      expect.anything(),
      "u-test",
      [{
        category: "job",
        entryId: "warrior",
        amount: COOP_MASTERY_TOME_GAIN,
        source: "job.consumable",
      }],
      expect.any(Date),
    );
  });

  it("비급이 없으면 직업 도감 숙련도를 기록하지 않는다", async () => {
    store.clear();
    store.set("character.v2", { class: "warrior", materials: {} });

    const res = await POST(req());

    expect(res.status).toBe(400);
    expect(recordCodexMasteryGameplayBatch).not.toHaveBeenCalled();
  });

  it("낚시 계열 현재 직업에는 상급 숙련 교본을 사용할 수 없다", async () => {
    store.clear();
    store.set("character.v2", {
      class: "survivor",
      specChoice: "fisher",
      materials: { [COOP_MASTERY_TOME_MATERIAL_ID]: 1 },
    });
    store.set("proficiency.v2", {
      points: 0,
      groups: { survivor: { tier: 1, cultivations: 0, cumLevel: 10 } },
      jobCumLevel: { fisher: 3 },
      caps: {},
      grown: {},
    });

    const res = await POST(req());
    const json = (await res.json()) as { ok?: boolean; error?: string };

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.error).toBe("fishing_job");
    expect(store.get("character.v2")).toMatchObject({
      materials: { [COOP_MASTERY_TOME_MATERIAL_ID]: 1 },
    });
    expect(store.get("proficiency.v2")).toMatchObject({
      jobCumLevel: { fisher: 3 },
    });
    expect(recordCodexMasteryGameplayBatch).not.toHaveBeenCalled();
  });
});
