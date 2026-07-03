import { describe, expect, it, vi } from "vitest";

const { store } = vi.hoisted(() => ({ store: new Map<string, unknown>() }));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-test"),
}));

vi.mock("@/lib/server/economyLog", () => ({
  recordEconomyEventSoon: vi.fn(),
  recordRewardFailureSoon: vi.fn(),
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
  });
});
