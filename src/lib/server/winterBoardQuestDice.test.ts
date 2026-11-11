import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ store: new Map<string, unknown>() }));

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({})),
  },
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(async (_tx, _uid, key: string, fallback: unknown) =>
    mocks.store.has(key) ? structuredClone(mocks.store.get(key)) : fallback,
  ),
  readSave: vi.fn(async (_tx, _uid, key: string, fallback: unknown) =>
    mocks.store.has(key) ? structuredClone(mocks.store.get(key)) : fallback,
  ),
  upsertSave: vi.fn(async (_tx, _uid, key: string, value: unknown) => {
    mocks.store.set(key, structuredClone(value));
  }),
}));
vi.mock("@/lib/server/v2QuestContext", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/v2QuestContext")>()),
  assembleQuestExtras: vi.fn(async () => ({ fishCaught: 0, arenaTimes: [] })),
}));

import { kstDayKey, kstWeekMondayKey } from "@/lib/kst";
import { REPEAT_QUESTS_KEY } from "@/lib/server/v2QuestContext";
import { countCompletedDailyQuests } from "./winterBoardQuestDice";

const NOW = new Date("2026-11-20T12:00:00+09:00");
const BASELINE = {
  battleCount: 10,
  fishCaught: 0,
  enhanceAttempts: 0,
  farmHarvests: 0,
  woodcuttingCuts: 0,
  miningSuccesses: 0,
  workshopCrafts: 0,
};

function seedRepeat() {
  mocks.store.set(REPEAT_QUESTS_KEY, {
    daily: { key: kstDayKey(NOW), baseline: BASELINE, claimed: [] },
    weekly: { key: kstWeekMondayKey(NOW), baseline: BASELINE, claimed: [] },
  });
}

afterEach(() => mocks.store.clear());

describe("오늘 완료한 일일 퀘스트 수", () => {
  it("기준선 이후 진행도가 목표를 넘은 일일 퀘스트만 센다", async () => {
    seedRepeat();
    mocks.store.set("adventure-log.v2", {
      monsters: { slime: { kills: 45 } },
      battleLosses: 0,
    });
    expect(await countCompletedDailyQuests("u", NOW)).toBe(1);
  });

  it("오늘 한 것이 없으면 0이다", async () => {
    seedRepeat();
    mocks.store.set("adventure-log.v2", { monsters: { slime: { kills: 12 } } });
    expect(await countCompletedDailyQuests("u", NOW)).toBe(0);
  });
});
