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

import { POST } from "@/app/api/v2/me/skill-ritual/route";
import {
  parseProficiency,
  usablePoints,
} from "@/adventure/data/v2/proficiency";
import { parseV2SkillsState } from "@/adventure/data/v2/v2Skills";

function req(skillId: string): Request {
  return new Request("http://t/api/v2/me/skill-ritual", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ skillId }),
  });
}

describe("skill-ritual route", () => {
  it("배운 스킬을 골드+숙달 포인트로 강화한다", async () => {
    store.clear();
    store.set("character.v2", {
      class: "warrior",
      gold: 1_050_000,
      bankedGold: 1_000_000,
    });
    store.set("skills.v2", {
      learned: ["v2_skill_strike"],
      equipped: ["v2_skill_strike"],
    });
    store.set("proficiency.v2", {
      points: 500,
      groups: { warrior: { tier: 1, cultivations: 0, cumLevel: 0 } },
      caps: {},
      grown: {},
    });

    const res = await POST(req("v2_skill_strike"));
    const json = (await res.json()) as {
      ok?: boolean;
      level?: number;
      bonusPct?: number;
      gold?: number;
      bankedGold?: number;
      points?: number;
    };

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.level).toBe(1);
    expect(json.bonusPct).toBe(2);
    expect(json.gold).toBe(50_000);
    expect(json.bankedGold).toBe(1_000_000);
    expect(json.points).toBe(200);
    expect(
      parseV2SkillsState(store.get("skills.v2")).enhancements?.v2_skill_strike,
    ).toBe(1);
    expect(usablePoints(parseProficiency(store.get("proficiency.v2")))).toBe(200);
  });

  it("다음 단계의 직업 숙련도 조건을 검사한다", async () => {
    store.clear();
    store.set("character.v2", {
      class: "warrior",
      gold: 10_000_000,
      bankedGold: 0,
    });
    store.set("skills.v2", {
      learned: ["v2_skill_strike"],
      equipped: ["v2_skill_strike"],
      enhancements: { v2_skill_strike: 1 },
    });
    store.set("proficiency.v2", {
      points: 2_000,
      groups: { warrior: { tier: 1, cultivations: 0, cumLevel: 149 } },
      caps: {},
      grown: {},
    });

    const res = await POST(req("v2_skill_strike"));
    const json = (await res.json()) as {
      ok?: boolean;
      error?: string;
      requiredJobCumLevel?: number;
    };

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.error).toBe("insufficient_mastery");
    expect(json.requiredJobCumLevel).toBe(150);
    expect(
      parseV2SkillsState(store.get("skills.v2")).enhancements?.v2_skill_strike,
    ).toBe(1);
  });
});
