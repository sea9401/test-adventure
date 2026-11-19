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
import { PEDDLER_SAVE_KEY } from "@/adventure/v2/peddler";
import { STORM_EXPEDITION_SAVE_KEY } from "@/adventure/data/v2/stormExpedition";
import { CHARACTER_STATE_KEY } from "@/lib/storage-keys";
import { activityTabDots, applyActivityPreferences, DEFAULT_ADVENTURE_HOME_PREFERENCES } from "@/adventure/v2/adventureDashboard";

describe("일일 퀘스트 보상 레드닷", () => {
  it.each([
    ["수령 가능", "2026-09-06", false, 30, true],
    ["목표 미달", "2026-09-06", false, 0, false],
    ["수령 완료", "2026-09-06", true, 30, false],
    ["자정 초기화", "2026-09-05", false, 30, false],
  ] as const)("%s", (_name, key, bundleClaimed, kills, ready) => {
    const activities = resolveAdventureActivities({
      "repeat-quests.v2": { daily: {
        key, bundleClaimed, claimed: [],
        baseline: { battleCount: 0, fishCaught: 0, enhanceAttempts: 0, farmHarvests: 0, woodcuttingCuts: 0, miningSuccesses: 0, workshopCrafts: 0 },
      } },
      "adventure-log.v2": { monsters: { slime: { kills } }, enhanceAttempts: 1 },
      "woodcutting-log.v1": { cuts: 3 },
      "mining-log.v1": { successes: 3 },
    }, Date.UTC(2026, 8, 6, 4));
    expect(activities.find((a) => a.id === "daily_quest_reward")?.state)
      .toBe(ready ? "actionable" : bundleClaimed ? "completed" : "in_progress");
    const enabled = applyActivityPreferences(activities, DEFAULT_ADVENTURE_HOME_PREFERENCES);
    const dots = activityTabDots(enabled, true);
    expect(dots.tabs.character === true).toBe(ready);
    expect(dots.paths["/quests"] === true).toBe(ready);
    expect(activityTabDots(enabled, false).tabs.character).toBeUndefined();
  });
});

describe("모험 대시보드 서버 활동 변환", () => {
  it("주간 농장 납품은 선택지 수와 무관하게 3건이면 완료된다", () => {
    const now = Date.parse("2026-09-09T12:00:00+09:00");
    const farm = emptyFarmState(now);
    farm.weekly.claimedIds = ["weekly-bakery-crate", "weekly-tomato", "weekly-cacao"];
    const weekly = resolveAdventureActivities({ [FARM_SAVE_KEY]: farm }, now)
      .find(activity => activity.id === "farm_weekly");
    expect(weekly).toMatchObject({ current: 3, target: 3, detail: "3 / 3", state: "completed" });
  });
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

  it("도착한 행상 수레는 행동 가능한 생활 활동이 되고 행상 메뉴에 점을 띄운다", () => {
    const now = Date.UTC(2026, 10, 20, 4);
    const hour = 60 * 60 * 1000;
    const dispatch = (startedAt: number, hours: number) => ({
      hours, startedAt, readyAt: startedAt + hours * hour, points: 2_000, tokens: 10,
    });
    const activities = resolveAdventureActivities(
      {
        ...ADVENTURE_DASHBOARD_SAVE_FALLBACKS,
        [PEDDLER_SAVE_KEY]: {
          routes: {
            river: { standingPoints: 0, dispatch: dispatch(now - 5 * hour, 4) },
            ridge: { standingPoints: 0, dispatch: dispatch(now - 5 * hour, 8) },
          },
        },
      },
      now,
    );
    const peddler = activities.find(({ id }) => id === "peddler_ready");
    expect(peddler).toMatchObject({
      group: "ready",
      tab: "life",
      title: "행상",
      href: "/town/peddler",
      state: "actionable",
      detail: "도착한 수레 1대",
    });
    const dots = activityTabDots(
      applyActivityPreferences(activities, DEFAULT_ADVENTURE_HOME_PREFERENCES),
      true,
    );
    expect(dots.paths["/town/peddler"]).toBe(true);
    expect(dots.tabs.life).toBe(true);
  });

  it("길 위의 행상 수레는 가장 먼저 도착할 수레의 남은 시간을 보여 준다", () => {
    const now = Date.UTC(2026, 10, 20, 4);
    const hour = 60 * 60 * 1000;
    const activities = resolveAdventureActivities(
      {
        ...ADVENTURE_DASHBOARD_SAVE_FALLBACKS,
        [PEDDLER_SAVE_KEY]: {
          routes: {
            river: { standingPoints: 0, dispatch: { hours: 12, startedAt: now - hour, readyAt: now + 11 * hour, points: 2_000, tokens: 17 } },
            harbor: { standingPoints: 0, dispatch: { hours: 4, startedAt: now - hour, readyAt: now + 3 * hour, points: 2_000, tokens: 10 } },
          },
        },
      },
      now,
    );
    expect(activities.find(({ id }) => id === "peddler_ready")).toMatchObject({
      state: "in_progress",
      detail: "3시간 남음",
      readyAt: now + 3 * hour,
    });
  });

  it("보낸 행상 수레가 없으면 알림을 만들지 않는 대기 상태다", () => {
    const activities = resolveAdventureActivities(
      { ...ADVENTURE_DASHBOARD_SAVE_FALLBACKS },
      Date.UTC(2026, 10, 20, 4),
    );
    expect(activities.find(({ id }) => id === "peddler_ready")).toMatchObject({
      state: "completed",
      detail: "보낸 수레 없음",
    });
  });

  it("아레나는 참여 횟수를 표시하지만 일일 완료 집계에는 넣지 않는다", () => {
    const activities = resolveAdventureActivities(
      ADVENTURE_DASHBOARD_SAVE_FALLBACKS,
      Date.UTC(2026, 7, 24, 4),
    );

    expect(activities.find(({ id }) => id === "arena_daily")).toMatchObject({
      detail: "오늘 0회 참여",
      countsTowardCompletion: false,
    });
  });
});
