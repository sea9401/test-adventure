import { describe, expect, it, vi, beforeEach } from "vitest";

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

import { POST } from "@/app/api/v2/dev/grant/route";
import { parseProficiency } from "@/adventure/data/v2/proficiency";

function req(body: unknown): Request {
  return new Request("http://t/api/v2/dev/grant", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v2/dev/grant", () => {
  beforeEach(() => {
    store.clear();
    store.set("character.v2", {
      class: "warrior",
      specChoice: null,
      level: 10,
      exp: 0,
      gold: 0,
    });
    store.set("proficiency.v2", {
      points: 100,
      groups: { warrior: { tier: 1, cultivations: 0, cumLevel: 30 } },
      jobCumLevel: { warrior: 5 },
      masteryScaleVersion: 1,
    });
  });

  it("mastery 지급은 현재 직업의 직군/직업별 숙련도를 같이 올린다", async () => {
    const res = await POST(req({ mastery: 7 }));
    const json = (await res.json()) as {
      ok?: boolean;
      masteryEarned?: number;
    };

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.masteryEarned).toBe(37);

    const prof = parseProficiency(store.get("proficiency.v2"));
    expect(prof.groups.warrior?.cumLevel).toBe(37);
    expect(prof.jobCumLevel?.warrior).toBe(12);
    expect(prof.points).toBe(100);
  });
});
