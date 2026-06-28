import { describe, expect, it, vi } from "vitest";

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
  lockSaveForUpdate: vi.fn(async (_tx, _uid, key: string, fallback: unknown) =>
    store.has(key) ? store.get(key) : fallback,
  ),
  upsertSave: vi.fn(async (_tx, _uid, key: string, value: unknown) => {
    store.set(key, value);
  }),
}));

import { POST } from "@/app/api/v2/me/learn-skill/route";
import { parseProficiency, usablePoints } from "@/adventure/data/v2/proficiency";

function req(skillId: string): Request {
  return new Request("http://t/api/v2/me/learn-skill", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ skillId }),
  });
}

describe("learn-skill — 현재 직업 jobId 킷 기준", () => {
  it("코어루프 평탄화(tier=1) 상태에서도 4차 직업 스킬을 학습한다", async () => {
    store.clear();
    store.set("character.v2", {
      class: "warrior",
      specChoice: "veteran",
      level: 100,
    });
    store.set("skills.v2", { learned: [], equipped: [] });
    store.set("proficiency.v2", {
      points: 6000,
      groups: { warrior: { tier: 1, cultivations: 0, cumLevel: 1800 } },
      caps: {},
      grown: {},
      masteryScaleVersion: 1,
    });

    const res = await POST(req("v2c_veteran_cleave"));
    const json = (await res.json()) as {
      ok?: boolean;
      learned?: string[];
      spent?: number;
      points?: number;
    };

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.spent).toBe(5000);
    expect(json.points).toBe(1000);
    expect(json.learned).toContain("v2c_veteran_cleave");
    expect(usablePoints(parseProficiency(store.get("proficiency.v2")))).toBe(1000);
  });
});
