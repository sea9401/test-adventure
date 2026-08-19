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

vi.mock("@/lib/server/economyLog", () => ({
  recordEconomyEventSoon: vi.fn(),
  recordRewardFailureSoon: vi.fn(),
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

import { POST } from "@/app/api/v2/mastery-tower/use-certificate/route";
import { MASTERY_CERTIFICATE_KEY } from "@/adventure/data/v2/masteryTower";

function req(body: Record<string, unknown>): Request {
  return new Request("http://t/api/v2/mastery-tower/use-certificate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("mastery certificate route", () => {
  beforeEach(() => {
    recordCodexMasteryGameplayBatch.mockClear();
  });

  it("숙련 증서를 공용 숙달 포인트로 1:1 전환한다", async () => {
    store.clear();
    store.set("character.v2", { class: "none" });
    store.set("inventory.v2", { [MASTERY_CERTIFICATE_KEY]: 5 });
    store.set("proficiency.v2", {
      points: 7,
      groups: {},
      caps: {},
      grown: {},
    });

    const res = await POST(req({ mode: "proficiency", amount: 3 }));
    const json = (await res.json()) as {
      ok?: boolean;
      mode?: string;
      used?: number;
      remaining?: number;
      proficiencyAfter?: number;
    };

    expect(res.status).toBe(200);
    expect(json).toMatchObject({
      ok: true,
      mode: "proficiency",
      used: 3,
      remaining: 2,
      proficiencyAfter: 10,
    });
    expect(store.get("inventory.v2")).toEqual({
      [MASTERY_CERTIFICATE_KEY]: 2,
    });
    expect(store.get("proficiency.v2")).toMatchObject({ points: 10 });
    expect(recordCodexMasteryGameplayBatch).not.toHaveBeenCalled();
  });

  it("mode를 생략하면 기존처럼 선택한 직업 숙련도를 올린다", async () => {
    store.clear();
    store.set("character.v2", { class: "warrior" });
    store.set("inventory.v2", { [MASTERY_CERTIFICATE_KEY]: 5 });
    store.set("proficiency.v2", {
      points: 9,
      groups: { warrior: { tier: 1, cultivations: 0, cumLevel: 100 } },
      jobCumLevel: { warrior: 100 },
      caps: {},
      grown: {},
    });

    const res = await POST(req({ jobId: "warrior", amount: 2 }));
    const json = (await res.json()) as {
      ok?: boolean;
      mode?: string;
      used?: number;
      jobMastery?: number;
    };

    expect(res.status).toBe(200);
    expect(json).toMatchObject({
      ok: true,
      mode: "mastery",
      used: 2,
      jobMastery: 102,
    });
    expect(store.get("inventory.v2")).toEqual({
      [MASTERY_CERTIFICATE_KEY]: 3,
    });
    expect(store.get("proficiency.v2")).toMatchObject({
      points: 9,
      groups: { warrior: { cumLevel: 102 } },
      jobCumLevel: { warrior: 102 },
    });
    expect(recordCodexMasteryGameplayBatch).toHaveBeenCalledWith(
      expect.anything(),
      "u-test",
      [{
        category: "job",
        entryId: "warrior",
        amount: 2,
        source: "job.consumable",
      }],
      expect.any(Date),
    );
  });

  it("알 수 없는 증서 사용 용도는 거부한다", async () => {
    store.clear();
    store.set("inventory.v2", { [MASTERY_CERTIFICATE_KEY]: 5 });

    const res = await POST(req({ mode: "gold", amount: 3 }));
    const json = (await res.json()) as { ok?: boolean; error?: string };

    expect(res.status).toBe(400);
    expect(json).toEqual({ ok: false, error: "bad_mode" });
    expect(store.get("inventory.v2")).toEqual({
      [MASTERY_CERTIFICATE_KEY]: 5,
    });
    expect(recordCodexMasteryGameplayBatch).not.toHaveBeenCalled();
  });

  it("숙련 증서는 낚시 계열 직업에 사용할 수 없다", async () => {
    store.clear();
    store.set("character.v2", { class: "survivor", specChoice: "fisher" });
    store.set("inventory.v2", { [MASTERY_CERTIFICATE_KEY]: 5 });
    store.set("proficiency.v2", {
      points: 0,
      groups: { survivor: { tier: 1, cultivations: 0, cumLevel: 100 } },
      jobCumLevel: { fisher: 10 },
      caps: {},
      grown: {},
    });

    const res = await POST(req({ jobId: "fisher", amount: 2 }));
    const json = (await res.json()) as { ok?: boolean; error?: string };

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.error).toBe("fishing_job");
    expect(store.get("inventory.v2")).toEqual({
      [MASTERY_CERTIFICATE_KEY]: 5,
    });
    expect(store.get("proficiency.v2")).toMatchObject({
      jobCumLevel: { fisher: 10 },
    });
    expect(recordCodexMasteryGameplayBatch).not.toHaveBeenCalled();
  });
});
