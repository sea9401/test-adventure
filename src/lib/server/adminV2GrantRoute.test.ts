import { describe, expect, it, vi, beforeEach } from "vitest";

const { store } = vi.hoisted(() => ({ store: new Map<string, unknown>() }));

vi.mock("@/lib/server/isAdmin", () => ({
  requireAdmin: vi.fn(async () => null),
  currentAdminEmail: vi.fn(async () => "admin@example.com"),
}));

vi.mock("@/lib/server/adminAudit", () => ({
  logAdminAction: vi.fn(async () => {}),
}));

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb({})),
  },
}));

vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(
    async (_tx, uid: string, key: string, fallback: unknown) => {
      const scoped = `${uid}:${key}`;
      return store.has(scoped) ? store.get(scoped) : fallback;
    },
  ),
  upsertSave: vi.fn(async (_tx, uid: string, key: string, value: unknown) => {
    store.set(`${uid}:${key}`, value);
  }),
}));

import { POST } from "@/app/api/admin/v2-grant/route";
import { parseProficiency } from "@/adventure/data/v2/proficiency";

function req(body: unknown): Request {
  return new Request("http://t/api/admin/v2-grant", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/v2-grant", () => {
  beforeEach(() => {
    store.clear();
    store.set("target:character.v2", {
      class: "warrior",
      specChoice: null,
      level: 10,
    });
    store.set("target:proficiency.v2", {
      points: 100,
      groups: { warrior: { tier: 1, cultivations: 0, cumLevel: 30 } },
      jobCumLevel: { warrior: 5 },
      masteryScaleVersion: 1,
    });
  });

  it("mastery 지급은 대상의 현재 직업 숙련도를 올린다", async () => {
    const res = await POST(req({ userId: "target", mastery: 7 }));
    const json = (await res.json()) as {
      ok?: boolean;
      masteryEarned?: number;
    };

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.masteryEarned).toBe(37);

    const prof = parseProficiency(store.get("target:proficiency.v2"));
    expect(prof.groups.warrior?.cumLevel).toBe(37);
    expect(prof.jobCumLevel?.warrior).toBe(12);
    expect(prof.points).toBe(100);
  });
});
