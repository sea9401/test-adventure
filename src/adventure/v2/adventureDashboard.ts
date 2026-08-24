export const DEFAULT_ADVENTURE_HOME_WIDGET_ORDER = [
  "character_summary",
  "activity_checklist",
  "quest_rewards",
  "hot_time",
  "announcements",
  "bulletin_preview",
  "ranking_preview",
] as const;

export type AdventureHomeWidgetId =
  (typeof DEFAULT_ADVENTURE_HOME_WIDGET_ORDER)[number];

export type AdventureHomePreferences = {
  version: 1;
  widgetOrder: AdventureHomeWidgetId[];
  hiddenWidgetIds: AdventureHomeWidgetId[];
  characterExpanded: boolean;
  activityEnabled: Record<string, boolean>;
  seenUnlockedActivityIds: string[];
};

export const DEFAULT_ADVENTURE_HOME_PREFERENCES: AdventureHomePreferences = {
  version: 1,
  widgetOrder: [...DEFAULT_ADVENTURE_HOME_WIDGET_ORDER],
  hiddenWidgetIds: [],
  characterExpanded: false,
  activityEnabled: {},
  seenUnlockedActivityIds: [],
};

export type AdventureActivityGroup = "daily" | "weekly" | "ready";
export type AdventureActivityState =
  | "completed"
  | "actionable"
  | "in_progress"
  | "unavailable";
export type AdventureActivityTab =
  | "battle"
  | "town"
  | "life"
  | "character"
  | "guild";

export type AdventureActivityView = {
  id: string;
  group: AdventureActivityGroup;
  tab: AdventureActivityTab | null;
  title: string;
  detail: string;
  href: string;
  state: AdventureActivityState;
  current?: number;
  target?: number;
  resetAt?: number;
  readyAt?: number;
  enabled: boolean;
  defaultEnabled: boolean;
};

export type AdventureDashboardSummary = {
  completed: number;
  total: number;
  actionableCount: number;
};

export type AdventureDashboardSnapshot = {
  serverNow: number;
  preferences: AdventureHomePreferences;
  activities: AdventureActivityView[];
  summary: AdventureDashboardSummary;
  notifications: ReturnType<typeof activityTabDots>;
};

const WIDGET_IDS = new Set<string>(DEFAULT_ADVENTURE_HOME_WIDGET_ORDER);

function uniqueKnownStrings(
  value: unknown,
  known: ReadonlySet<string>,
): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string =>
    typeof item === "string" && known.has(item),
  ))];
}

export function normalizeAdventureHomePreferences(
  value: unknown,
  knownActivityIds: readonly string[],
): AdventureHomePreferences {
  if (value == null || typeof value !== "object") {
    return {
      ...DEFAULT_ADVENTURE_HOME_PREFERENCES,
      widgetOrder: [...DEFAULT_ADVENTURE_HOME_WIDGET_ORDER],
      hiddenWidgetIds: [],
      activityEnabled: {},
      seenUnlockedActivityIds: [],
    };
  }

  const raw = value as Record<string, unknown>;
  const savedOrder = uniqueKnownStrings(raw.widgetOrder, WIDGET_IDS) as AdventureHomeWidgetId[];
  const savedSet = new Set(savedOrder);
  const widgetOrder = [
    ...savedOrder,
    ...DEFAULT_ADVENTURE_HOME_WIDGET_ORDER.filter((id) => !savedSet.has(id)),
  ];
  const knownActivities = new Set(knownActivityIds);
  const rawEnabled = raw.activityEnabled;
  const activityEnabled: Record<string, boolean> = {};
  if (rawEnabled != null && typeof rawEnabled === "object") {
    for (const [id, enabled] of Object.entries(rawEnabled)) {
      if (knownActivities.has(id) && typeof enabled === "boolean") {
        activityEnabled[id] = enabled;
      }
    }
  }

  return {
    version: 1,
    widgetOrder,
    hiddenWidgetIds: uniqueKnownStrings(
      raw.hiddenWidgetIds,
      WIDGET_IDS,
    ) as AdventureHomeWidgetId[],
    characterExpanded: raw.characterExpanded === true,
    activityEnabled,
    seenUnlockedActivityIds: uniqueKnownStrings(
      raw.seenUnlockedActivityIds,
      knownActivities,
    ),
  };
}

export function activitySummary(
  activities: readonly AdventureActivityView[],
): AdventureDashboardSummary {
  const enabledAvailable = activities.filter(
    (item) => item.enabled && item.state !== "unavailable",
  );
  const cyclical = enabledAvailable.filter((item) => item.group !== "ready");
  return {
    completed: cyclical.filter((item) => item.state === "completed").length,
    total: cyclical.length,
    actionableCount: enabledAvailable.filter(
      (item) => item.state === "actionable",
    ).length,
  };
}

const ACTIVITY_STATE_PRIORITY: Record<AdventureActivityState, number> = {
  actionable: 0,
  in_progress: 1,
  completed: 2,
  unavailable: 3,
};

export function sortAdventureActivities(
  activities: readonly AdventureActivityView[],
): AdventureActivityView[] {
  return activities
    .map((item, index) => ({ item, index }))
    .sort(
      (a, b) =>
        ACTIVITY_STATE_PRIORITY[a.item.state] -
          ACTIVITY_STATE_PRIORITY[b.item.state] || a.index - b.index,
    )
    .map(({ item }) => item);
}

export function activityTabDots(activities: readonly AdventureActivityView[]) {
  const tabs: Partial<Record<AdventureActivityTab, true>> = {};
  const paths: Record<string, true> = {};
  for (const activity of activities) {
    if (!activity.enabled || activity.state !== "actionable") continue;
    if (activity.tab != null) tabs[activity.tab] = true;
    paths[activity.href] = true;
  }
  return { tabs, paths };
}

export function applyActivityPreferences(
  activities: readonly Omit<AdventureActivityView, "enabled">[],
  preferences: AdventureHomePreferences,
): AdventureActivityView[] {
  return activities.map((activity) => ({
    ...activity,
    enabled:
      preferences.activityEnabled[activity.id] ?? activity.defaultEnabled,
  }));
}
