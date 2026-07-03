import { describe, expect, it, vi } from "vitest";

const { store } = vi.hoisted(() => ({ store: new Map<string, unknown>() }));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-test"),
}));

vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: vi.fn(() => null),
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
import { COOP_MASTERY_TOME_MATERIAL_ID } from "@/adventure/data/v2/coopRewards";

function req(): Request {
  return new Request("http://t/api/v2/me/use-coop-mastery-tome", {
    method: "POST",
  });
}

describe("use-coop-mastery-tome route", () => {
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
  });
});
