import { db } from "@/db";
import { opsSettings } from "@/db/schema";
import { logAdminAction } from "@/lib/server/adminAudit";
import {
  currentAdminEmail,
  requireAdmin,
} from "@/lib/server/isAdmin";
import {
  ALERT_THRESHOLDS_KEY,
  HOT_TIME_KEY,
  HOT_TIME_SCHEDULES_KEY,
  parseAlertThresholds,
  parseHotTime,
  parseHotTimeSchedules,
  readAlertThresholdSettings,
  readHotTimeSettings,
  readHotTimeSchedules,
} from "@/lib/server/opsSettings";

export async function GET() {
  const gate = await requireAdmin();
  if (gate) return gate;

  const [
    { hotTime, updatedByEmail, updatedAt },
    { schedules, updatedByEmail: scheduleUpdatedByEmail, updatedAt: scheduleUpdatedAt },
    {
      alertThresholds,
      updatedByEmail: alertThresholdsUpdatedByEmail,
      updatedAt: alertThresholdsUpdatedAt,
    },
  ] = await Promise.all([
    readHotTimeSettings(),
    readHotTimeSchedules(),
    readAlertThresholdSettings(),
  ]);

  return Response.json({
    ok: true,
    hotTime,
    updatedByEmail,
    updatedAt: updatedAt?.toISOString() ?? null,
    hotTimeSchedules: schedules,
    hotTimeSchedulesUpdatedByEmail: scheduleUpdatedByEmail,
    hotTimeSchedulesUpdatedAt: scheduleUpdatedAt?.toISOString() ?? null,
    alertThresholds,
    alertThresholdsUpdatedByEmail,
    alertThresholdsUpdatedAt: alertThresholdsUpdatedAt?.toISOString() ?? null,
  });
}

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (gate) return gate;

  const body = (await req.json().catch(() => null)) as
    | {
        hotTime?: unknown;
        hotTimeSchedules?: unknown;
        alertThresholds?: unknown;
      }
    | null;
  if (!body || typeof body !== "object") {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const adminEmail = await currentAdminEmail();
  const now = new Date();
  const updated: Record<string, unknown> = {};

  if ("hotTime" in body) {
    const hotTime = parseHotTime(body.hotTime);
    await upsertSetting(HOT_TIME_KEY, hotTime, adminEmail, now);
    await logAdminAction({
      adminEmail,
      action: "ops-settings.hot-time.update",
      detail: { enabled: hotTime.enabled, title: hotTime.title },
    });
    updated.hotTime = hotTime;
  }

  if ("hotTimeSchedules" in body) {
    const hotTimeSchedules = parseHotTimeSchedules(body.hotTimeSchedules);
    await upsertSetting(HOT_TIME_SCHEDULES_KEY, hotTimeSchedules, adminEmail, now);
    await logAdminAction({
      adminEmail,
      action: "ops-settings.hot-time-schedules.update",
      detail: { count: hotTimeSchedules.length },
    });
    updated.hotTimeSchedules = hotTimeSchedules;
  }

  if ("alertThresholds" in body) {
    const alertThresholds = parseAlertThresholds(body.alertThresholds);
    await upsertSetting(ALERT_THRESHOLDS_KEY, alertThresholds, adminEmail, now);
    await logAdminAction({
      adminEmail,
      action: "ops-settings.alert-thresholds.update",
      detail: alertThresholds,
    });
    updated.alertThresholds = alertThresholds;
  }

  if (Object.keys(updated).length === 0) {
    return Response.json({ ok: false, error: "no setting provided" }, { status: 400 });
  }

  return Response.json({ ok: true, ...updated, updatedByEmail: adminEmail });
}

async function upsertSetting(
  key: string,
  value: unknown,
  adminEmail: string,
  updatedAt: Date,
) {
  await db
    .insert(opsSettings)
    .values({
      key,
      value,
      updatedByEmail: adminEmail,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: opsSettings.key,
      set: {
        value,
        updatedByEmail: adminEmail,
        updatedAt,
      },
    });
}
