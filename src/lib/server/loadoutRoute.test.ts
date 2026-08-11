import { beforeEach, describe, expect, it, vi } from "vitest";

const { store } = vi.hoisted(() => ({ store: new Map<string, unknown>() }));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-test"),
}));

vi.mock("@/adventure/data/v2/coreLoopConfig", async (importActual) => {
  const actual =
    await importActual<typeof import("@/adventure/data/v2/coreLoopConfig")>();
  return { ...actual, V2_CORE_LOOP_V2: true };
});

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb({})),
  },
}));

vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(
    async (_tx, _uid, key: string, fallback: unknown) =>
      store.has(key) ? store.get(key) : fallback,
  ),
  readSave: vi.fn(async (_tx, _uid, key: string, fallback: unknown) =>
    store.has(key) ? store.get(key) : fallback,
  ),
  upsertSave: vi.fn(async (_tx, _uid, key: string, value: unknown) => {
    store.set(key, value);
  }),
}));

import { POST } from "@/app/api/v2/me/loadout/route";

const LIFESTYLE_SKILL = "v2c_farmer_seedselection";

function request(equipped: string[]): Request {
  return new Request("http://t/api/v2/me/loadout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ equipped }),
  });
}

describe("POST /api/v2/me/loadout — 생활 패시브", () => {
  beforeEach(() => {
    store.clear();
    store.set("character.v2", { class: "survivor", level: 1 });
    store.set("skills.v2", {
      learned: [LIFESTYLE_SKILL],
      equipped: [],
    });
    store.set("proficiency.v2", {
      points: 0,
      groups: {},
      caps: {},
      grown: {},
    });
  });

  it("요청에서 빠진 학습 생활 패시브도 응답과 저장값에 포함한다", async () => {
    const response = await POST(request([]));
    const json = (await response.json()) as {
      ok?: boolean;
      equipped?: string[];
    };

    expect(response.status).toBe(200);
    expect(json.equipped).toEqual([LIFESTYLE_SKILL]);
    expect(
      (store.get("skills.v2") as { equipped: string[] }).equipped,
    ).toEqual([LIFESTYLE_SKILL]);
  });
});
