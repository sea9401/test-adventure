import { beforeEach, describe, expect, it, vi } from "vitest";

const { store } = vi.hoisted(() => ({ store: new Map<string, unknown>() }));
const keyOf = (userId: string, key: string) => `${userId}::${key}`;

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async (): Promise<string | null> => "u1"),
}));
vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: vi.fn(() => null),
}));
vi.mock("@/db", () => ({
  db: {
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
import { TITLES } from "@/adventure/data/titles";
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
const ACHIEVEMENT = V2_QUESTS.find((quest) => !isTutorialLine(quest.line));

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
    vi.mocked(ensureUser).mockResolvedValue("u1");
    store.set(keyOf("u1", "equipment.v2"), {
      owned: [{ iid: "eq_owned", id: EQUIPMENT_ID }],
      equipped: {},
    });
    store.set(keyOf("u1", "adventure-log.v2"), {
      titles: { [TITLE_ID]: { obtainedAt: 1 } },
    });
    store.set(keyOf("u1", GUIDE_QUESTS_KEY), {
      claimed: ACHIEVEMENT ? [ACHIEVEMENT.id] : [],
    });
  });

  it("requires authentication", async () => {
    vi.mocked(ensureUser).mockResolvedValueOnce(null);
    expect((await post(null)).status).toBe(401);
  });

  it("rejects malformed and unowned selections", async () => {
    expect((await post({ kind: "equipment", iid: "missing" })).status).toBe(400);
    expect((await post({ kind: "title", titleId: "missing" })).status).toBe(400);
    expect((await post({ kind: "achievement", achievementId: "missing" })).status).toBe(400);
    expect((await post({ kind: "invalid", id: "x" })).status).toBe(400);
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
      ).toEqual({ selection });
    }
  });

  it("returns only owned titles and claimed non-tutorial achievements", async () => {
    store.set(keyOf("u1", PROFILE_SHOWCASE_SAVE_KEY), {
      selection: { kind: "equipment", iid: "eq_owned" },
    });
    const response = await GET(
      new Request("http://t/api/v2/me/profile-showcase"),
    );
    const body = (await response.json()) as {
      selection: unknown;
      titleOptions: { id: string }[];
      achievementOptions: { id: string }[];
    };
    expect(response.status).toBe(200);
    expect(body.selection).toEqual({ kind: "equipment", iid: "eq_owned" });
    expect(body.titleOptions.map((option) => option.id)).toEqual([TITLE_ID]);
    expect(body.achievementOptions.map((option) => option.id)).toEqual([
      ACHIEVEMENT?.id,
    ]);
  });
});
