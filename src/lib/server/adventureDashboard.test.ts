import { describe, expect, it } from "vitest";
import {
  ADVENTURE_DASHBOARD_SAVE_FALLBACKS,
  resolveAdventureActivities,
} from "./adventureDashboard";
import { FARM_SAVE_KEY, emptyFarmState } from "@/adventure/v2/farm";
import {
  MINING_AUTO_KEY,
  WOODCUTTING_AUTO_KEY,
} from "@/adventure/v2/autoGathering";
import { FISHING_DAILY_KEY } from "@/adventure/data/v2/fishingDailyChallenges";
import { STORM_EXPEDITION_SAVE_KEY } from "@/adventure/data/v2/stormExpedition";
import { CHARACTER_STATE_KEY } from "@/lib/storage-keys";

describe("모험 대시보드 서버 활동 변환", () => {
  it("수확과 자동 채집 완료를 행동 가능한 생활 활동으로 만든다", () => {
    const now = Date.UTC(2026, 7, 24, 4);
    const farm = emptyFarmState(now);
    farm.plots[0] = {
      ...farm.plots[0],
      cropId: "wheat",
      plantedAt: now - 10_000,
      readyAt: now - 1,
    };

    const activities = resolveAdventureActivities(
      {
        ...ADVENTURE_DASHBOARD_SAVE_FALLBACKS,
        [FARM_SAVE_KEY]: farm,
        [WOODCUTTING_AUTO_KEY]: {
          session: {
            sessionId: "wood-1",
            planId: "short",
            sourceId: "oak",
            sourceName: "참나무 숲",
            materialId: "wood",
            startedAt: now - 20_000,
            readyAt: now - 1,
            cycleDurationMs: 10_000,
            attempts: 1,
            successRate: 1,
            materialEfficiency: 1,
            xpEfficiency: 1,
            bonusMaterialRate: 0,
            baseXp: 1,
          },
        },
      },
      now,
    );

    expect(activities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "farm_ready", state: "actionable" }),
        expect.objectContaining({
          id: "woodcutting_ready",
          state: "actionable",
        }),
      ]),
    );
  });

  it("낚시 보상 수령 가능과 원정 일일 횟수를 정확히 요약한다", () => {
    const now = Date.UTC(2026, 7, 24, 4);
    const dayKey = "2026-08-24";
    const activities = resolveAdventureActivities(
      {
        ...ADVENTURE_DASHBOARD_SAVE_FALLBACKS,
        [FISHING_DAILY_KEY]: {
          key: dayKey,
          caught: 8,
          rarePlus: 0,
          big80: 0,
          specialGuests: 0,
          fishCounts: {},
          species: [],
          claimed: [],
          claimedContracts: [],
        },
        [STORM_EXPEDITION_SAVE_KEY]: {
          date: dayKey,
          attemptsUsed: 3,
          active: null,
        },
        [CHARACTER_STATE_KEY]: { frontierDepth: 72 },
      },
      now,
    );

    expect(activities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "fishing_daily",
          state: "actionable",
        }),
        expect.objectContaining({
          id: "storm_expedition_daily",
          state: "completed",
          current: 3,
          target: 3,
        }),
      ]),
    );
  });

  it("진행 작업이 없는 채집은 알림을 만들지 않는 완료 상태다", () => {
    const activities = resolveAdventureActivities(
      {
        ...ADVENTURE_DASHBOARD_SAVE_FALLBACKS,
        [MINING_AUTO_KEY]: {},
      },
      Date.UTC(2026, 7, 24, 4),
    );
    expect(activities.find(({ id }) => id === "mining_ready")).toMatchObject({
      state: "completed",
      detail: "진행 중인 작업 없음",
    });
  });
});
