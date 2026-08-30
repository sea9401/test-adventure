import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GROWTH_LEAP_SAVE_KEY,
  activateGrowthLeap,
  recordGrowthLeapStamina,
} from "@/adventure/data/v2/growthLeap";

const mocks = vi.hoisted(() => ({
  saves: new Map<string, unknown>(),
}));

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-quest"),
}));
vi.mock("@/lib/server/savesKv", () => ({
  readSave: vi.fn(
    async (_db: object, _userId: string, key: string, fallback: unknown) =>
      mocks.saves.get(key) ?? fallback,
  ),
  upsertSave: vi.fn(async () => undefined),
}));
vi.mock("@/lib/server/v2QuestContext", () => ({
  GUIDE_QUESTS_KEY: "guide-quests.v2",
  REPEAT_QUESTS_KEY: "repeat-quests.v2",
  assembleQuestExtras: vi.fn(async () => ({})),
  buildQuestCtx: vi.fn(() => ({})),
  buildRepeatSignals: vi.fn(() => ({})),
  parseClaimed: vi.fn(() => new Set<string>()),
  parseTrackedQuestId: vi.fn(() => null),
}));
vi.mock("@/adventure/data/v2/v2Quests", () => ({
  achievementSummary: vi.fn(() => ({ points: 0, claimed: 0, total: 0 })),
  claimedUniqueEquipmentAcquisitionFloor: vi.fn(() => 0),
  currentGuideQuest: vi.fn(() => null),
  deriveQuestViews: vi.fn(() => []),
  questLinesFor: vi.fn(() => []),
}));
vi.mock("@/lib/server/questTitleBackfill", () => ({
  addTitlesToAdventureLog: vi.fn((raw: unknown) => raw),
  backfillClaimedQuestTitleRewards: vi.fn(async () => []),
}));
vi.mock("@/adventure/data/v2/v2RepeatQuests", () => ({
  deriveRepeatBundle: vi.fn(() => ({
    completed: 0,
    required: 1,
    ready: false,
    claimed: false,
    reward: { staminaPotions: 0 },
  })),
  deriveRepeatViews: vi.fn(() => []),
  nextDailyResetAt: vi.fn(() => 1),
  nextWeeklyResetAt: vi.fn(() => 2),
  parseRepeatSave: vi.fn(() => ({})),
  rolloverRepeatSave: vi.fn(() => ({ changed: false, save: {} })),
}));
vi.mock("@/lib/server/opsSettings", () => ({
  readLifeFieldFeatureSettings: vi.fn(async () => ({ milestonesEnabled: false })),
}));
vi.mock("@/adventure/data/v2/monsterHuntCodex", () => ({
  deriveMonsterHuntCodex: vi.fn(() => ({ entries: [] })),
}));
vi.mock("@/lib/server/uniqueEquipmentAchievement", () => ({
  ensureUniqueEquipmentAcquisitionBaseline: vi.fn(async () => ({})),
  persistedUniqueEquipmentAcquired: vi.fn(() => 0),
  uniqueEquipmentAcquisitionProgress: vi.fn(() => 0),
}));

import { GET } from "@/app/api/v2/me/quests/route";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-20T03:00:00Z"));
  vi.clearAllMocks();
  mocks.saves.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("퀘스트 조회의 성장 도약 의뢰", () => {
  it("구매하지 않은 계정에도 명시적인 미구매 상태를 반환한다", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      growthLeap: { status: "not_purchased" },
    });
  });

  it("활성 의뢰의 서버 진행도와 받을 수 있는 단계를 반환한다", async () => {
    const activated = activateGrowthLeap({}, Date.now() - 1_000);
    if (!activated.ok) throw new Error("expected activation");
    mocks.saves.set(
      GROWTH_LEAP_SAVE_KEY,
      recordGrowthLeapStamina(activated.state, 3_000, Date.now()),
    );

    const json = await (await GET()).json();

    expect(json.growthLeap).toMatchObject({
      status: "active",
      staminaSpent: 3_000,
      maxStamina: 50_000,
    });
    expect(json.growthLeap.milestones).toEqual(
      expect.arrayContaining([
        { id: "growth_1", claimable: true, claimed: false },
        { id: "growth_2", claimable: false, claimed: false },
      ].map((milestone) => expect.objectContaining(milestone))),
    );
  });
});
