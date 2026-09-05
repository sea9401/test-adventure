import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WeeklyFacilitySourceSelection } from "@/adventure/data/v2/adventurerAssociation";
import type { CodexMasteryGameplayEvent } from "@/lib/server/codexMasteryGameplay";

const {
  store,
  recordCodexMasteryGameplayBatch,
  claimWeeklyFacilitySource,
  readWeeklyFacilitySourceSelection,
} = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  recordCodexMasteryGameplayBatch: vi.fn(
    async (
      _executor: unknown,
      _userId: string,
      _events: readonly CodexMasteryGameplayEvent[],
      _now: Date,
    ) => [],
  ),
  claimWeeklyFacilitySource: vi.fn(async () => ({
    ok: true as const,
    selected: "association" as const,
  })),
  readWeeklyFacilitySourceSelection: vi.fn(
    async (): Promise<WeeklyFacilitySourceSelection | null> => null,
  ),
}));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-test"),
}));
vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: vi.fn(() => null),
}));
vi.mock("@/lib/server/adventurerAssociation", () => ({
  canUseAdventurerAssociation: vi.fn(async () => true),
  associationFacilityLevel: vi.fn(async () => 1),
  claimWeeklyFacilitySource,
  readWeeklyFacilitySourceSelection,
}));
vi.mock("@/lib/server/economyLog", () => ({
  recordEconomyEventSoon: vi.fn(),
  recordRewardFailureSoon: vi.fn(),
}));
vi.mock("@/lib/server/guildActivityLog", () => ({
  logGuildActivity: vi.fn(async () => undefined),
}));
vi.mock("@/lib/server/codexMasteryGameplay", () => ({
  recordCodexMasteryGameplayBatch,
}));
vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: object) => unknown) =>
      callback({}),
    ),
  },
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(
    async (_tx, _userId, key: string, fallback: unknown) =>
      store.has(key) ? store.get(key) : fallback,
  ),
  readSave: vi.fn(async (_tx, _userId, key: string, fallback: unknown) =>
    store.has(key) ? store.get(key) : fallback,
  ),
  upsertSave: vi.fn(
    async (_tx, _userId, key: string, value: unknown) => {
      store.set(key, value);
    },
  ),
}));

import { GET, POST } from "@/app/api/v2/guild/training-ground/route";
import {
  todayGuildTrainingKey,
  todayGuildTrainingWeekKey,
} from "@/adventure/data/v2/guildTrainingGround";

const NOW = Date.parse("2026-08-20T12:00:00+09:00");

function request() {
  return new Request(
    "http://test/api/v2/guild/training-ground?scope=association",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ drillId: "basic_stance" }),
    },
  );
}

function viewRequest() {
  return new Request(
    "http://test/api/v2/guild/training-ground?scope=association",
  );
}

function seedTraining(claimed: string[] = []) {
  store.clear();
  store.set("character.v2", { class: "warrior", level: 1, gold: 0 });
  store.set("proficiency.v2", {
    points: 0,
    groups: { warrior: { tier: 1, cultivations: 0, cumLevel: 10 } },
    jobCumLevel: { warrior: 10 },
    caps: {},
    grown: {},
  });
  store.set("skills.v2", { learned: [], equipped: [] });
  store.set("guild-training.v1", {
    dayKey: todayGuildTrainingKey(new Date(NOW)),
    claimed,
    weekKey: todayGuildTrainingWeekKey(new Date(NOW)),
    weeklyClaims: claimed.length,
  });
}

describe("guild training codex mastery wiring", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    recordCodexMasteryGameplayBatch.mockClear();
    claimWeeklyFacilitySource.mockClear();
    readWeeklyFacilitySourceSelection.mockReset();
    readWeeklyFacilitySourceSelection.mockResolvedValue(null);
  });

  it("수령한 훈련 보상을 현재 직업 도감 숙련도로 기록한다", async () => {
    seedTraining();

    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      rewardMastery: 12,
      masteryAfter: 22,
    });
    expect(recordCodexMasteryGameplayBatch).toHaveBeenCalledWith(
      expect.anything(),
      "u-test",
      [{
        category: "job",
        entryId: "warrior",
        amount: 12,
        source: "job.training",
      }],
      new Date(NOW),
    );
  });

  it("이미 수령한 훈련은 직업 도감 숙련도를 중복 기록하지 않는다", async () => {
    seedTraining(["basic_stance"]);

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(recordCodexMasteryGameplayBatch).not.toHaveBeenCalled();
  });

  it("현재 주간 출처와 협회 훈련장이 충돌하면 GET에서 이용 불가를 알린다", async () => {
    seedTraining();
    readWeeklyFacilitySourceSelection.mockResolvedValue({
      weekKey: todayGuildTrainingWeekKey(new Date(NOW)),
      source: "guild",
      guildId: 11,
    });

    const response = await GET(viewRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      weeklySourceEligible: false,
      claimableCount: 0,
    });
  });
});
