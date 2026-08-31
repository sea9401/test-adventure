import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { readSaves } from "@/lib/server/savesKv";
import {
  activitySummary,
  activityTabDots,
  applyActivityPreferences,
  normalizeAdventureHomePreferences,
  sortAdventureActivities,
} from "@/adventure/v2/adventureDashboard";
import {
  ADVENTURE_ACTIVITY_IDS,
  ADVENTURE_DASHBOARD_SAVE_FALLBACKS,
  ADVENTURE_HOME_SAVE_KEY,
  resolveAdventureActivities,
} from "@/lib/server/adventureDashboard";

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const serverNow = Date.now();
  const saves = await readSaves(
    db,
    userId,
    ADVENTURE_DASHBOARD_SAVE_FALLBACKS,
  );
  const preferences = normalizeAdventureHomePreferences(
    saves[ADVENTURE_HOME_SAVE_KEY],
    ADVENTURE_ACTIVITY_IDS,
  );
  const activities = sortAdventureActivities(
    applyActivityPreferences(
      resolveAdventureActivities(saves, serverNow),
      preferences,
    ),
  );

  return Response.json({
    ok: true,
    serverNow,
    preferences,
    activities,
    summary: activitySummary(activities),
    notifications: activityTabDots(
      activities,
      preferences.activityNotificationsEnabled,
    ),
  });
}
