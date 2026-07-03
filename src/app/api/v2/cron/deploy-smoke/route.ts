import { desc } from "drizzle-orm";
import { db } from "@/db";
import { abuseEvents, adminAuditLog, economyEvents, opsSettings } from "@/db/schema";
import { requireCronAuth } from "@/lib/server/cronAuth";
import {
  readAlertThresholdSettings,
  readHotTimeSchedules,
  readHotTimeSettings,
  readRewardCompensationPresets,
  readRewardFailureStatuses,
} from "@/lib/server/opsSettings";

export async function POST(req: Request) {
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;

  const [
    hotTime,
    hotTimeSchedules,
    alertThresholds,
    rewardFailureStatuses,
    rewardCompensationPresets,
    economy,
    abuse,
    audit,
    settings,
  ] = await Promise.all([
    readHotTimeSettings(),
    readHotTimeSchedules(),
    readAlertThresholdSettings(),
    readRewardFailureStatuses(),
    readRewardCompensationPresets(),
    db
      .select({ id: economyEvents.id })
      .from(economyEvents)
      .orderBy(desc(economyEvents.id))
      .limit(1),
    db
      .select({ id: abuseEvents.id })
      .from(abuseEvents)
      .orderBy(desc(abuseEvents.id))
      .limit(1),
    db
      .select({ id: adminAuditLog.id })
      .from(adminAuditLog)
      .orderBy(desc(adminAuditLog.id))
      .limit(1),
    db.select({ key: opsSettings.key }).from(opsSettings).limit(1),
  ]);
  const apiModules = await Promise.all([
    import("@/app/api/v2/fishing/status/route"),
    import("@/app/api/v2/dungeon/hunt/route"),
    import("@/app/api/v2/guild/training-ground/route"),
    import("@/app/api/admin/ops-dashboard/route"),
    import("@/app/api/admin/ops-settings/route"),
    import("@/app/api/admin/ops-search/route"),
    import("@/app/api/admin/me/route"),
    import("@/app/api/admin/reward-failures/resolve/route"),
  ]);

  return Response.json({
    ok: true,
    hotTimeEnabled: hotTime.hotTime.enabled,
    economyReadable: Array.isArray(economy),
    abuseReadable: Array.isArray(abuse),
    auditReadable: Array.isArray(audit),
    settingsReadable: Array.isArray(settings),
    hotTimeScheduleCount: hotTimeSchedules.schedules.length,
    alertThresholdsReadable: alertThresholds.alertThresholds.rewardFailures > 0,
    rewardFailureStatusReadable: Array.isArray(rewardFailureStatuses),
    rewardCompensationPresetCount: rewardCompensationPresets.presets.length,
    fishingStatusApiLoaded: typeof apiModules[0].GET === "function",
    huntApiLoaded: typeof apiModules[1].POST === "function",
    guildTrainingApiLoaded: typeof apiModules[2].GET === "function",
    adminOpsApiLoaded: typeof apiModules[3].GET === "function",
    adminOpsSettingsApiLoaded:
      typeof apiModules[4].GET === "function" && typeof apiModules[4].POST === "function",
    adminOpsSearchApiLoaded: typeof apiModules[5].GET === "function",
    adminMeApiLoaded: typeof apiModules[6].GET === "function",
    rewardFailureResolveApiLoaded: typeof apiModules[7].POST === "function",
  });
}
