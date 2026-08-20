import { beforeEach, describe, expect, it, vi } from "vitest";

const { store, account, mastery } = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  account: { email: "player@example.com" },
  mastery: {
    trophiesEnabled: false,
    progressRows: [] as unknown[],
    history: [] as unknown[],
    researchHistory: [] as unknown[],
  },
}));
const keyOf = (userId: string, key: string) => `${userId}::${key}`;

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async (): Promise<string | null> => "u1"),
}));
vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: vi.fn(() => null),
}));
vi.mock("@/lib/server/opsSettings", () => ({
  readCodexMasteryFeatureSettings: vi.fn(async () => ({
    recordingEnabled: false,
    overviewVisible: false,
    rankingVisible: false,
    sealsEnabled: false,
    trophiesEnabled: mastery.trophiesEnabled,
    monthlyProgressEnabled: false,
    monthlyRankingVisible: false,
    settlementEnabled: false,
    feedEnabled: false,
  })),
}));
vi.mock("@/lib/server/codexMasteryRepository", () => ({
  readCodexMasteryProgressRows: vi.fn(async () => mastery.progressRows),
}));
vi.mock("@/lib/server/codexMasteryTrophyRepository", () => ({
  readCodexMasteryTrophyHistory: vi.fn(async () => mastery.history),
}));
vi.mock("@/lib/server/codexResearchTrophies", () => ({
  readCodexResearchTrophyHistory: vi.fn(async () => mastery.researchHistory),
}));
vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: () => ({
        where: () => ({
          limit: async () => [{ email: account.email }],
        }),
      }),
    })),
    transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({})),
  },
}));
vi.mock("@/lib/server/savesKv", () => ({
  readSave: vi.fn(
    async (_db: unknown, userId: string, key: string, fallback: unknown) =>
      store.has(keyOf(userId, key)) ? store.get(keyOf(userId, key)) : fallback,
  ),
  lockSaveForUpdate: vi.fn(
    async (_tx: unknown, userId: string, key: string, fallback: unknown) =>
      store.has(keyOf(userId, key)) ? store.get(keyOf(userId, key)) : fallback,
  ),
  upsertSave: vi.fn(
    async (_tx: unknown, userId: string, key: string, value: unknown) => {
      store.set(keyOf(userId, key), value);
    },
  ),
}));

import { GET, POST } from "@/app/api/v2/me/profile-showcase/route";
import { GM_TITLE_ID, TITLES } from "@/adventure/data/titles";
import { V2_EQUIPMENT } from "@/adventure/data/v2/v2Equipment";
import {
  V2_QUESTS,
  isTutorialLine,
} from "@/adventure/data/v2/v2Quests";
import { PROFILE_SHOWCASE_SAVE_KEY } from "@/adventure/profile/profileShowcase";
import { ensureUser } from "@/lib/server/ensureUser";
import { GUIDE_QUESTS_KEY } from "@/lib/server/v2QuestContext";

const TITLE_ID = Object.keys(TITLES)[0];
const EQUIPMENT_ID = Object.keys(V2_EQUIPMENT)[0];
const ACHIEVEMENT = V2_QUESTS.find(
  (quest) => !isTutorialLine(quest.line) && quest.badgeTier != null,
);

function post(selection: unknown) {
  return POST(
    new Request("http://t/api/v2/me/profile-showcase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selection }),
    }),
  );
}

describe("profile showcase route", () => {
  beforeEach(() => {
    store.clear();
    account.email = "player@example.com";
    mastery.trophiesEnabled = false;
    mastery.progressRows = [];
    mastery.history = [];
    mastery.researchHistory = [];
    vi.mocked(ensureUser).mockResolvedValue("u1");
    store.set(keyOf("u1", "character.v2"), {
      profileBadgeStandOwned: true,
    });
    store.set(keyOf("u1", "equipment.v2"), {
      owned: [{ iid: "eq_owned", id: EQUIPMENT_ID }],
      equipped: {},
    });
    store.set(keyOf("u1", "adventure-log.v2"), {
      titles: { [TITLE_ID]: { obtainedAt: 1 } },
    });
    store.set(keyOf("u1", GUIDE_QUESTS_KEY), {
      claimed: ACHIEVEMENT ? [ACHIEVEMENT.id, "combat_10"] : ["combat_10"],
    });
  });

  it("requires authentication", async () => {
    vi.mocked(ensureUser).mockResolvedValueOnce(null);
    expect((await post(null)).status).toBe(401);
  });

  it("requires the display stand before any slot can be changed", async () => {
    store.set(keyOf("u1", "character.v2"), {});

    const response = await post(null);

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("stand_required");
    expect(store.has(keyOf("u1", PROFILE_SHOWCASE_SAVE_KEY))).toBe(false);
  });

  it("rejects malformed and unowned selections", async () => {
    expect((await post({ kind: "equipment", iid: "missing" })).status).toBe(400);
    expect((await post({ kind: "title", titleId: "missing" })).status).toBe(400);
    expect((await post({ kind: "achievement", achievementId: "missing" })).status).toBe(400);
    expect(
      (await post({ kind: "achievement", achievementId: "combat_10" })).status,
    ).toBe(400);
    expect((await post({ kind: "invalid", id: "x" })).status).toBe(400);
    const gm = await post({ kind: "title", titleId: GM_TITLE_ID });
    expect(gm.status).toBe(400);
    expect((await gm.json()).error).toBe("unknown_title");
  });

  it("offers and saves GM only for an admin account without a stored grant", async () => {
    const previous = process.env.ADMIN_EMAILS;
    process.env.ADMIN_EMAILS = "admin@example.com";
    account.email = "admin@example.com";
    store.set(keyOf("u1", "adventure-log.v2"), { titles: {} });
    try {
      const getResponse = await GET(
        new Request("http://t/api/v2/me/profile-showcase"),
      );
      const getBody = (await getResponse.json()) as {
        titleOptions: { id: string }[];
      };
      expect(getBody.titleOptions.map((option) => option.id)).toContain(
        GM_TITLE_ID,
      );

      const postResponse = await post({ kind: "title", titleId: GM_TITLE_ID });
      expect(postResponse.status).toBe(200);
    } finally {
      if (previous === undefined) delete process.env.ADMIN_EMAILS;
      else process.env.ADMIN_EMAILS = previous;
    }
  });

  it("saves owned equipment, title, achievement and clears the slot", async () => {
    const selections = [
      { kind: "equipment", iid: "eq_owned" },
      { kind: "title", titleId: TITLE_ID },
      { kind: "achievement", achievementId: ACHIEVEMENT?.id },
      null,
    ];
    for (const selection of selections) {
      const response = await post(selection);
      expect(response.status).toBe(200);
      expect(
        store.get(keyOf("u1", PROFILE_SHOWCASE_SAVE_KEY)),
      ).toEqual({ slots: [selection, null, null], visible: true });
    }
  });

  it("saves all three unlocked slots and rejects duplicate badges", async () => {
    if (!ACHIEVEMENT) throw new Error("achievement fixture missing");
    const slots = [
      { kind: "equipment", iid: "eq_owned" },
      { kind: "title", titleId: TITLE_ID },
      { kind: "achievement", achievementId: ACHIEVEMENT.id },
    ];
    const response = await POST(
      new Request("http://t/api/v2/me/profile-showcase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slots }),
      }),
    );

    expect(response.status).toBe(200);
    expect(store.get(keyOf("u1", PROFILE_SHOWCASE_SAVE_KEY))).toEqual({
      slots,
      visible: true,
    });

    const duplicate = await POST(
      new Request("http://t/api/v2/me/profile-showcase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slots: [slots[2], slots[2], null] }),
      }),
    );
    expect(duplicate.status).toBe(400);
    expect((await duplicate.json()).error).toBe("duplicate_selection");
  });

  it("toggles visibility without changing the three selected slots", async () => {
    const slots = ACHIEVEMENT
      ? [{ kind: "achievement", achievementId: ACHIEVEMENT.id }, null, null]
      : [null, null, null];
    store.set(keyOf("u1", PROFILE_SHOWCASE_SAVE_KEY), {
      slots,
      visible: true,
    });

    const response = await POST(
      new Request("http://t/api/v2/me/profile-showcase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visible: false }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      slots,
      visible: false,
    });
    expect(store.get(keyOf("u1", PROFILE_SHOWCASE_SAVE_KEY))).toEqual({
      slots,
      visible: false,
    });
  });

  it("rejects visibility changes before purchase and malformed toggle values", async () => {
    const malformed = await POST(
      new Request("http://t/api/v2/me/profile-showcase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visible: "off" }),
      }),
    );
    expect(malformed.status).toBe(400);

    store.set(keyOf("u1", "character.v2"), {});
    const unowned = await POST(
      new Request("http://t/api/v2/me/profile-showcase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visible: false }),
      }),
    );
    expect(unowned.status).toBe(403);
    expect((await unowned.json()).error).toBe("stand_required");
  });

  it("returns only owned titles and claimed badge milestones", async () => {
    store.set(keyOf("u1", PROFILE_SHOWCASE_SAVE_KEY), {
      selection: { kind: "equipment", iid: "eq_owned" },
    });
    const response = await GET(
      new Request("http://t/api/v2/me/profile-showcase"),
    );
    const body = (await response.json()) as {
      standOwned: boolean;
      visible: boolean;
      selection: unknown;
      slots: unknown[];
      titleOptions: { id: string }[];
      achievementOptions: { id: string }[];
    };
    expect(response.status).toBe(200);
    expect(body.standOwned).toBe(true);
    expect(body.visible).toBe(true);
    expect(body.selection).toEqual({ kind: "equipment", iid: "eq_owned" });
    expect(body.slots).toEqual([
      { kind: "equipment", iid: "eq_owned" },
      null,
      null,
    ]);
    expect(body.titleOptions.map((option) => option.id)).toEqual([TITLE_ID]);
    expect(body.achievementOptions.map((option) => option.id)).toEqual([
      ACHIEVEMENT?.id,
    ]);
  });

  it("keeps mastery trophies out of the legacy response while the flag is off", async () => {
    const response = await GET(new Request("http://t/api/v2/me/profile-showcase"));
    const body = (await response.json()) as {
      trophyOptions: Array<{ kind?: string }>;
    };

    expect(response.status).toBe(200);
    expect(body.trophyOptions.every((option) => option.kind !== "mastery")).toBe(true);
  });

  it("offers earned and locked mastery families and saves an earned family", async () => {
    mastery.trophiesEnabled = true;
    mastery.history = [{
      trophyId: "mastery:fish",
      kind: "mastery_category",
      currentTier: "bronze",
      tierAchievedAt: { bronze: "2026-08-20T00:00:00.000Z" },
      catalogVersion: 1,
    }];

    const getResponse = await GET(
      new Request("http://t/api/v2/me/profile-showcase"),
    );
    const getBody = (await getResponse.json()) as {
      trophyOptions: Array<{ id: string; kind?: string; unlocked: boolean }>;
    };
    const masteryOptions = getBody.trophyOptions.filter(
      (option) => option.kind === "mastery",
    );
    expect(masteryOptions).toHaveLength(7);
    expect(masteryOptions.find((option) => option.id === "mastery:fish")?.unlocked)
      .toBe(true);
    expect(masteryOptions.find((option) => option.id === "mastery:overall")?.unlocked)
      .toBe(false);

    const saved = await post({
      kind: "masteryTrophy",
      trophyId: "mastery:fish",
    });
    expect(saved.status).toBe(200);
    expect(store.get(keyOf("u1", PROFILE_SHOWCASE_SAVE_KEY))).toEqual({
      slots: [{ kind: "masteryTrophy", trophyId: "mastery:fish" }, null, null],
      visible: true,
    });
  });

  it("offers and saves an earned monthly research trophy", async () => {
    mastery.trophiesEnabled = true;
    mastery.researchHistory = [{
      trophyId: "research:2026-08",
      kind: "research_season",
      currentTier: "legendary",
      tierAchievedAt: { legendary: "2026-08-31T15:00:01.000Z" },
      catalogVersion: 1,
      seasonMetadata: {
        seasonId: "2026-08",
        themeId: "rivers-and-lakes",
        themeName: "강과 호수의 달",
        finalRank: 1,
        score: 19_000,
        objectiveCompletedCount: 18,
        objectiveScore: 12_000,
        diversityScore: 4_000,
        recordScore: 3_000,
        representativeRecord: null,
        settledAt: "2026-08-31T15:00:01.000Z",
        firstPlaceEngraving: true,
      },
    }];

    const body = await GET(new Request("http://t/api/v2/me/profile-showcase"))
      .then((response) => response.json()) as {
        trophyOptions: Array<{ id: string; kind?: string }>;
      };
    expect(body.trophyOptions).toContainEqual(expect.objectContaining({
      id: "research:2026-08",
      kind: "research",
    }));

    const saved = await post({
      kind: "masteryTrophy",
      trophyId: "research:2026-08",
    });
    expect(saved.status).toBe(200);
  });

  it("rejects disabled, unknown, and unearned mastery selections without deleting stored ones", async () => {
    const selection = { kind: "masteryTrophy", trophyId: "mastery:fish" };
    store.set(keyOf("u1", PROFILE_SHOWCASE_SAVE_KEY), {
      slots: [selection, null, null],
      visible: true,
    });

    expect((await post(selection)).status).toBe(409);
    const visibility = await POST(
      new Request("http://t/api/v2/me/profile-showcase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visible: false }),
      }),
    );
    expect(visibility.status).toBe(200);
    expect(store.get(keyOf("u1", PROFILE_SHOWCASE_SAVE_KEY))).toEqual({
      slots: [selection, null, null],
      visible: false,
    });

    mastery.trophiesEnabled = true;
    mastery.history = [];
    expect((await post(selection)).status).toBe(400);
    expect((await post({ kind: "masteryTrophy", trophyId: "mastery:missing" })).status)
      .toBe(400);
  });
});
