import { describe, expect, it } from "vitest";
import {
  DEFAULT_ADVENTURE_HOME_PREFERENCES,
  DEFAULT_ADVENTURE_HOME_WIDGET_ORDER,
  activitySummary,
  activityTabDots,
  normalizeAdventureHomePreferences,
  sortAdventureActivities,
  type AdventureActivityView,
} from "./adventureDashboard";

const activity = (
  overrides: Partial<AdventureActivityView> & Pick<AdventureActivityView, "id">,
): AdventureActivityView => ({
  group: "daily",
  tab: "life",
  title: overrides.id,
  detail: "진행 상태",
  href: "/town/farm",
  state: "in_progress",
  enabled: true,
  defaultEnabled: true,
  ...overrides,
});

describe("모험 홈 환경설정 정규화", () => {
  it("알 수 없는 값과 중복을 버리고 새 기본 위젯을 뒤에 보충한다", () => {
    const parsed = normalizeAdventureHomePreferences(
      {
        version: 1,
        widgetOrder: ["ranking_preview", "ranking_preview", "unknown"],
        hiddenWidgetIds: ["ranking_preview", "unknown"],
        characterExpanded: true,
        activityEnabled: { farm_ready: false, unknown: true },
        seenUnlockedActivityIds: ["farm_ready", "farm_ready", "unknown"],
      },
      ["farm_ready", "fishing_daily"],
    );

    expect(parsed.widgetOrder).toEqual([
      "ranking_preview",
      ...DEFAULT_ADVENTURE_HOME_WIDGET_ORDER.filter(
        (id) => id !== "ranking_preview",
      ),
    ]);
    expect(parsed.hiddenWidgetIds).toEqual(["ranking_preview"]);
    expect(parsed.characterExpanded).toBe(true);
    expect(parsed.activityEnabled).toEqual({ farm_ready: false });
    expect(parsed.seenUnlockedActivityIds).toEqual(["farm_ready"]);
  });

  it("저장값이 없으면 안전한 기본 설정을 반환한다", () => {
    expect(normalizeAdventureHomePreferences(null, [])).toEqual(
      DEFAULT_ADVENTURE_HOME_PREFERENCES,
    );
  });
});

describe("모험 활동 집계", () => {
  it("활성화된 일일·주간만 완료율에 넣고 ready는 행동 수에만 넣는다", () => {
    const summary = activitySummary([
      activity({ id: "daily_done", state: "completed" }),
      activity({ id: "weekly_ready", group: "weekly", state: "actionable" }),
      activity({ id: "farm_ready", group: "ready", state: "actionable" }),
      activity({ id: "disabled", state: "actionable", enabled: false }),
      activity({ id: "unavailable", state: "unavailable" }),
    ]);

    expect(summary).toEqual({
      completed: 1,
      total: 2,
      actionableCount: 2,
    });
  });

  it("행동 가능, 진행 중, 완료, 확인 불가 순으로 정렬한다", () => {
    const sorted = sortAdventureActivities([
      activity({ id: "done", state: "completed" }),
      activity({ id: "unknown", state: "unavailable" }),
      activity({ id: "working", state: "in_progress" }),
      activity({ id: "claim", state: "actionable" }),
    ]);

    expect(sorted.map(({ id }) => id)).toEqual([
      "claim",
      "working",
      "done",
      "unknown",
    ]);
  });

  it("활성 상태이며 지금 행동 가능한 활동만 탭과 경로 점을 만든다", () => {
    const dots = activityTabDots([
      activity({ id: "farm", state: "actionable", href: "/town/farm" }),
      activity({ id: "timer", state: "in_progress", href: "/town/logging" }),
      activity({
        id: "disabled",
        state: "actionable",
        tab: "battle",
        href: "/battle/arena",
        enabled: false,
      }),
      activity({
        id: "guild",
        state: "actionable",
        tab: "guild",
        href: "/guild?tab=raid",
      }),
    ]);

    expect(dots.tabs).toEqual({ life: true, guild: true });
    expect(dots.paths).toEqual({
      "/town/farm": true,
      "/guild?tab=raid": true,
    });
  });
});
