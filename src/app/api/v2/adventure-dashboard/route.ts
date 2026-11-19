import { LIFE_MAJOR_SAVE_KEY, lifeRenownFromSave } from "@/adventure/v2/lifeMajor";
import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { readSaves } from "@/lib/server/savesKv";
import { readAdventureFacilityContext } from "@/lib/server/adventureDashboardFacilities";
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
  const [saves, facilities] = await Promise.all([
    readSaves(db, userId, ADVENTURE_DASHBOARD_SAVE_FALLBACKS),
    readAdventureFacilityContext(userId),
  ]);
  const preferences = normalizeAdventureHomePreferences(
    saves[ADVENTURE_HOME_SAVE_KEY],
    ADVENTURE_ACTIVITY_IDS,
  );
  const activities = sortAdventureActivities(
    applyActivityPreferences(
      resolveAdventureActivities(saves, serverNow, facilities),
      preferences,
    ),
  );

  return Response.json({
    ok: true,
    serverNow,
    preferences,
    activities,
    summary: activitySummary(activities),
    lifeRenown: lifeRenownFromSave(saves[LIFE_MAJOR_SAVE_KEY]),
    notifications: activityTabDots(
      activities,
      preferences.activityNotificationsEnabled,
    ),
  });
}
