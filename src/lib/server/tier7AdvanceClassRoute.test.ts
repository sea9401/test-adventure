import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  failUpsertKey: null as string | null,
  mutex: Promise.resolve() as Promise<void>,
}));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-tier7"),
}));
vi.mock("@/adventure/data/v2/coreLoopConfig", async (importActual) => {
  const actual =
    await importActual<typeof import("@/adventure/data/v2/coreLoopConfig")>();
  return { ...actual, V2_CORE_LOOP_V2: true };
});
vi.mock("@/lib/server/v2QuestContext", () => ({
  loadCompletedQuestIds: vi.fn(async () => [] as string[]),
}));
vi.mock("@/db", () => {
  function databaseChain(): Record<string, unknown> {
    const chain: Record<string, unknown> = {};
    chain.from = () => chain;
    chain.where = () => chain;
    chain.for = () => chain;
    chain.limit = async () => [];
    return chain;
  }

  return {
    db: {
      transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
        const previous = harness.mutex;
        let release = () => {};
        harness.mutex = new Promise<void>((resolve) => {
          release = resolve;
        });
        await previous;
        const local = new Map(harness.store);
        const chain = databaseChain();
        const tx = {
          __saves: local,
          select: () => chain,
          insert: () => ({
            values: () => ({ onConflictDoUpdate: async () => undefined }),
          }),
        };
        try {
          const result = await callback(tx);
          harness.store.clear();
          for (const [key, value] of local) harness.store.set(key, value);
          return result;
        } finally {
          release();
        }
      }),
      select: () => databaseChain(),
    },
  };
});
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(
    async (
      tx: { __saves: Map<string, unknown> },
      _uid: string,
      key: string,
      fallback: unknown,
    ) => (tx.__saves.has(key) ? tx.__saves.get(key) : fallback),
  ),
  readSave: vi.fn(
    async (
      tx: { __saves: Map<string, unknown> },
      _uid: string,
      key: string,
      fallback: unknown,
    ) => (tx.__saves.has(key) ? tx.__saves.get(key) : fallback),
  ),
  readSaves: vi.fn(
    async (
      tx: { __saves: Map<string, unknown> },
      _uid: string,
      fallbacks: Record<string, unknown>,
    ) =>
      Object.fromEntries(
        Object.entries(fallbacks).map(([key, fallback]) => [
          key,
          tx.__saves.has(key) ? tx.__saves.get(key) : fallback,
        ]),
      ),
  ),
  upsertSave: vi.fn(
    async (
      tx: { __saves: Map<string, unknown> },
      _uid: string,
      key: string,
      value: unknown,
    ) => {
      if (harness.failUpsertKey === key) throw new Error("forced save failure");
      tx.__saves.set(key, value);
    },
  ),
}));

import { POST } from "@/app/api/v2/me/advance-class/route";
import {
  LEGACY_CLASS_SPEC_BY_JOB,
  V2_JOB_CATALOG,
} from "@/adventure/data/v2/v2JobCatalog";

function advanceReq(targetJobId: string): Request {
  return new Request("http://t/api/v2/me/advance-class", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ targetJobId }),
  });
}

type CandidateOverride = {
  currentJobId?: string;
  level?: number;
  fragments?: number;
  jobCumLevel?: Record<string, number>;
  jobHistory?: string[];
};

function legacyForJob(jobId: string): { class: string; specChoice: string | null } {
  const legacy = LEGACY_CLASS_SPEC_BY_JOB[jobId];
  if (!legacy) throw new Error(`missing legacy bridge for ${jobId}`);
  return { class: legacy.class, specChoice: legacy.spec };
}

function seedCandidate(override: CandidateOverride = {}): void {
  harness.store.clear();
  const currentJobId = override.currentJobId ?? "swordsaint";
  harness.store.set("character.v2", {
    ...legacyForJob(currentJobId),
    level: override.level ?? 100,
    materials:
      override.fragments == null
        ? { v2_storm_origin_fragment: 30 }
        : override.fragments > 0
          ? { v2_storm_origin_fragment: override.fragments }
          : {},
  });
  harness.store.set("skills.v2", { learned: [], equipped: [] });
  harness.store.set("proficiency.v2", {
    points: 0,
    groups: { warrior: { cultivations: 0, tier: 1, cumLevel: 0 } },
    caps: {},
    grown: {},
    jobCumLevel: override.jobCumLevel ?? {
      swordsaint: 100_000,
      blackmoon: 100_000,
    },
    jobHistory: override.jobHistory ?? [],
  });
}

function character(): Record<string, unknown> {
  return harness.store.get("character.v2") as Record<string, unknown>;
}

function proficiency(): Record<string, unknown> {
  return harness.store.get("proficiency.v2") as Record<string, unknown>;
}

beforeEach(() => {
  harness.failUpsertKey = null;
  harness.mutex = Promise.resolve();
  V2_JOB_CATALOG.shadowblade = {
    id: "shadowblade",
    name: "무영검신",
    tier: 7,
    cultivateProfile: { luk: 1 },
    jobBonus: { luk: 1 },
    unlock: {
      prereqs: { swordsaint: 100_000, blackmoon: 100_000 },
    },
  };
  LEGACY_CLASS_SPEC_BY_JOB.shadowblade = {
    class: "rogue",
    spec: "shadowblade",
  };
});

afterEach(() => {
  delete V2_JOB_CATALOG.shadowblade;
  delete LEGACY_CLASS_SPEC_BY_JOB.shadowblade;
  harness.store.clear();
  harness.failUpsertKey = null;
});

describe("advance-class tier 7 first unlock", () => {
  it("consumes 30 fragments and records the first unlock atomically", async () => {
    seedCandidate({ fragments: 35 });

    const response = await POST(advanceReq("shadowblade"));

    expect(response.status).toBe(200);
    expect(character()).toMatchObject({
      class: "rogue",
      specChoice: "shadowblade",
      level: 1,
      materials: { v2_storm_origin_fragment: 5 },
    });
    expect(proficiency().jobHistory).toContain("shadowblade");
  });

  it.each([
    [
      "mastery",
      { jobCumLevel: { swordsaint: 100_000, blackmoon: 99_999 } },
      "tier7_prerequisite_proficiency",
      30,
    ],
    ["current job", { currentJobId: "warrior" }, "tier7_current_job", 30],
    ["level", { level: 99 }, "level_too_low", 30],
    ["material", { fragments: 29 }, "tier7_material_shortage", 29],
  ] as const)(
    "rejects a missing %s requirement without spending materials",
    async (_label, override, expectedError, expectedFragments) => {
      seedCandidate(override);

      const response = await POST(advanceReq("shadowblade"));

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: expectedError });
      expect(
        (character().materials as Record<string, number>)
          .v2_storm_origin_fragment,
      ).toBe(expectedFragments);
    },
  );

  it("rolls back the debit and class change when a later save fails", async () => {
    seedCandidate({ fragments: 30 });
    harness.failUpsertKey = "skills.v2";

    await expect(POST(advanceReq("shadowblade"))).rejects.toThrow(
      "forced save failure",
    );

    expect(character()).toMatchObject({
      class: "warrior",
      specChoice: "swordsaint",
      materials: { v2_storm_origin_fragment: 30 },
    });
    expect((proficiency().jobHistory as string[]) ?? []).not.toContain(
      "shadowblade",
    );
  });

  it("serializes duplicate first-unlock requests and charges once", async () => {
    seedCandidate({ fragments: 60 });

    const responses = await Promise.all([
      POST(advanceReq("shadowblade")),
      POST(advanceReq("shadowblade")),
    ]);

    expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
    expect(character().materials).toEqual({ v2_storm_origin_fragment: 30 });
  });

  it("does not charge a permanently unlocked revisit", async () => {
    seedCandidate({
      currentJobId: "warrior",
      level: 100,
      fragments: 0,
      jobCumLevel: {},
      jobHistory: ["shadowblade"],
    });

    const response = await POST(advanceReq("shadowblade"));

    expect(response.status).toBe(200);
    expect(character().materials).toEqual({});
    expect(character()).toMatchObject({ class: "rogue", specChoice: "shadowblade" });
  });
});
