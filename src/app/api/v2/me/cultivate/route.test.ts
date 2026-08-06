import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  insertFeedEntry: vi.fn(async () => {}),
}));

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: object) => unknown) =>
      callback({}),
    ),
  },
}));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "cultivate-user"),
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(
    async (_tx, _userId, key: string, fallback: unknown) =>
      mocks.store.has(key) ? mocks.store.get(key) : fallback,
  ),
  upsertSave: vi.fn(
    async (_tx, _userId, key: string, value: unknown) => {
      mocks.store.set(key, value);
    },
  ),
}));
vi.mock("@/lib/server/serverFeed", () => ({
  insertFeedEntry: mocks.insertFeedEntry,
}));

import { POST } from "./route";
import { emptyProficiency } from "@/adventure/data/v2/proficiency";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.store.clear();
  mocks.store.set("character.v2", { class: "warrior", level: 1 });
  mocks.store.set("proficiency.v2", {
    ...emptyProficiency(),
    points: 1_000,
  });
});

describe("POST /api/v2/me/cultivate — 특별 수행", () => {
  it("5배 각성만 서버 전체 전광판 소식으로 기록한다", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    const response = await POST();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.mult).toBe(5);
    expect(mocks.insertFeedEntry).toHaveBeenCalledWith(
      "cultivate-user",
      "cultivation_awakening",
      { cultivationMult: 5 },
    );
  });

  it("3배 대성공은 전체 전광판에 기록하지 않는다", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.02);

    const response = await POST();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.mult).toBe(3);
    expect(mocks.insertFeedEntry).not.toHaveBeenCalled();
  });
});
