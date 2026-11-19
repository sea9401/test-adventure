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
import { activityTabDots, applyActivityPreferences, DEFAULT_ADVENTURE_HOME_PREFERENCES } from "@/adventure/v2/adventureDashboard";
import {
  COOKING_SAVE_KEY,
  cookingDayKey,
  cookingLevelXpThreshold,
  emptyCookingState,
} from "@/adventure/v2/cooking/state";
import { PEDDLER_SAVE_KEY, emptyPeddlerState } from "@/adventure/v2/peddler";
import { PEDDLER_REQUIRED_LIFE_LEVEL } from "@/adventure/v2/peddlerRules";

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

describe("주방 납품 체크 항목", () => {
  const now = Date.parse("2026-11-20T12:00:00+09:00");
  const find = (saves: Record<string, unknown>, id: string) =>
    resolveAdventureActivities({ ...ADVENTURE_DASHBOARD_SAVE_FALLBACKS, ...saves }, now)
      .find((activity) => activity.id === id);

  it("오늘 끝낸 조건 납품 수를 세고 세 건을 채우면 완료한다", () => {
    const cooking = emptyCookingState(now);
    cooking.daily.completedRequestIds = ["daily:a", "daily:b"];
    expect(find({ [COOKING_SAVE_KEY]: cooking }, "cooking_daily")).toMatchObject({
      group: "daily", tab: "life", title: "주방 일일 납품", href: "/town/kitchen",
      detail: "2 / 3", current: 2, target: 3, state: "in_progress",
    });
    cooking.daily.completedRequestIds = ["daily:a", "daily:b", "daily:c"];
    expect(find({ [COOKING_SAVE_KEY]: cooking }, "cooking_daily")).toMatchObject({
      detail: "3 / 3", state: "completed",
    });
  });

  it("어제 기록은 오늘 납품으로 세지 않는다", () => {
    const yesterday = now - 24 * 60 * 60 * 1000;
    const cooking = emptyCookingState(yesterday);
    cooking.daily.completedRequestIds = ["daily:a", "daily:b", "daily:c"];
    expect(cooking.daily.dayKey).not.toBe(cookingDayKey(now));
    expect(find({ [COOKING_SAVE_KEY]: cooking }, "cooking_daily")).toMatchObject({
      detail: "0 / 3", state: "in_progress",
    });
  });

  it("주간 납품은 이번 주에 끝냈을 때만 완료한다", () => {
    const cooking = emptyCookingState(now);
    expect(find({ [COOKING_SAVE_KEY]: cooking }, "cooking_weekly")).toMatchObject({
      group: "weekly", title: "주방 주간 납품", detail: "0 / 1", state: "in_progress",
    });
    cooking.weekly.completed = true;
    expect(find({ [COOKING_SAVE_KEY]: cooking }, "cooking_weekly")).toMatchObject({
      detail: "1 / 1", state: "completed",
    });
    const lastWeek = emptyCookingState(now - 7 * 24 * 60 * 60 * 1000);
    lastWeek.weekly.completed = true;
    expect(find({ [COOKING_SAVE_KEY]: lastWeek }, "cooking_weekly")).toMatchObject({
      detail: "0 / 1", state: "in_progress",
    });
  });
});

describe("행상 파견 체크 항목", () => {
  const now = Date.parse("2026-11-20T12:00:00+09:00");
  const HOUR = 60 * 60 * 1000;
  const peddlerActivity = (saves: Record<string, unknown>) =>
    resolveAdventureActivities({ ...ADVENTURE_DASHBOARD_SAVE_FALLBACKS, ...saves }, now)
      .find((activity) => activity.id === "peddler_ready");
  const dispatch = (readyAt: number) => ({
    hours: 4, startedAt: readyAt - 4 * HOUR, readyAt, points: 2_000, tokens: 10,
  });

  it("도착한 수레가 있으면 받을 수 있다고 알린다", () => {
    const peddler = emptyPeddlerState("2026-11-16");
    peddler.dispatchCount = 2;
    const [first, second] = Object.keys(peddler.routes) as (keyof typeof peddler.routes)[];
    peddler.routes[first].dispatch = dispatch(now - 1) as never;
    peddler.routes[second].dispatch = dispatch(now + 2 * HOUR) as never;
    expect(peddlerActivity({ [PEDDLER_SAVE_KEY]: peddler })).toMatchObject({
      group: "ready", tab: "life", title: "행상 파견", href: "/town/peddler",
      detail: "도착한 수레 1대", state: "actionable",
    });
  });

  it("가는 중인 수레만 있으면 가장 먼저 도착하는 시간을 보여 준다", () => {
    const peddler = emptyPeddlerState("2026-11-16");
    peddler.dispatchCount = 1;
    const [first, second] = Object.keys(peddler.routes) as (keyof typeof peddler.routes)[];
    peddler.routes[first].dispatch = dispatch(now + 5 * HOUR) as never;
    peddler.routes[second].dispatch = dispatch(now + 30 * 60 * 1000) as never;
    expect(peddlerActivity({ [PEDDLER_SAVE_KEY]: peddler })).toMatchObject({
      detail: "30분 남음", state: "in_progress", readyAt: now + 30 * 60 * 1000,
    });
  });

  it("보낸 수레가 없으면 대기로 둔다", () => {
    const peddler = emptyPeddlerState("2026-11-16");
    peddler.dispatchCount = 3;
    expect(peddlerActivity({ [PEDDLER_SAVE_KEY]: peddler })).toMatchObject({
      detail: "보낸 수레 없음", state: "completed",
    });
  });

  it("행상이 열리지 않은 계정에는 여는 조건을 보여 주고 집계에서 뺀다", () => {
    expect(peddlerActivity({})).toMatchObject({
      detail: `생활 Lv.${PEDDLER_REQUIRED_LIFE_LEVEL}에 열립니다`, state: "unavailable",
    });
  });

  it("한 번도 보내지 않았어도 생활 레벨을 채웠으면 열린 것으로 본다", () => {
    const cooking = emptyCookingState(now);
    cooking.xp = cookingLevelXpThreshold(PEDDLER_REQUIRED_LIFE_LEVEL);
    expect(peddlerActivity({ [COOKING_SAVE_KEY]: cooking })).toMatchObject({
      detail: "보낸 수레 없음", state: "completed",
    });
  });
});
