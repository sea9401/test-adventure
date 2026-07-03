import { logAdminAction } from "@/lib/server/adminAudit";
import {
  currentAdminEmail,
  requireAdmin,
} from "@/lib/server/isAdmin";
import {
  ALERT_THRESHOLDS_KEY,
  HOT_TIME_KEY,
  HOT_TIME_SCHEDULES_KEY,
  REWARD_COMPENSATION_PRESETS_KEY,
  parseAlertThresholds,
  parseHotTime,
  parseHotTimeSchedules,
  parseRewardCompensationPresets,
  readAlertThresholdSettings,
  readHotTimeSettings,
  readHotTimeSchedules,
  readRewardCompensationPresets,
  upsertOpsSetting,
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
    {
      presets: rewardCompensationPresets,
      updatedByEmail: rewardCompensationPresetsUpdatedByEmail,
      updatedAt: rewardCompensationPresetsUpdatedAt,
    },
  ] = await Promise.all([
    readHotTimeSettings(),
    readHotTimeSchedules(),
    readAlertThresholdSettings(),
    readRewardCompensationPresets(),
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
    rewardCompensationPresets,
    rewardCompensationPresetsUpdatedByEmail,
    rewardCompensationPresetsUpdatedAt:
      rewardCompensationPresetsUpdatedAt?.toISOString() ?? null,
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
        rewardCompensationPresets?: unknown;
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
    await upsertOpsSetting(HOT_TIME_KEY, hotTime, adminEmail, now);
    await logAdminAction({
      adminEmail,
      action: "ops-settings.hot-time.update",
      detail: { enabled: hotTime.enabled, title: hotTime.title },
    });
    updated.hotTime = hotTime;
  }

  if ("hotTimeSchedules" in body) {
    const hotTimeSchedules = parseHotTimeSchedules(body.hotTimeSchedules);
    await upsertOpsSetting(HOT_TIME_SCHEDULES_KEY, hotTimeSchedules, adminEmail, now);
    await logAdminAction({
      adminEmail,
      action: "ops-settings.hot-time-schedules.update",
      detail: { count: hotTimeSchedules.length },
    });
    updated.hotTimeSchedules = hotTimeSchedules;
  }

  if ("alertThresholds" in body) {
    const alertThresholds = parseAlertThresholds(body.alertThresholds);
    await upsertOpsSetting(ALERT_THRESHOLDS_KEY, alertThresholds, adminEmail, now);
    await logAdminAction({
      adminEmail,
      action: "ops-settings.alert-thresholds.update",
      detail: alertThresholds,
    });
    updated.alertThresholds = alertThresholds;
  }

  if ("rewardCompensationPresets" in body) {
    const rewardCompensationPresets = parseRewardCompensationPresets(
      body.rewardCompensationPresets,
    );
    await upsertOpsSetting(
      REWARD_COMPENSATION_PRESETS_KEY,
      rewardCompensationPresets,
      adminEmail,
      now,
    );
    await logAdminAction({
      adminEmail,
      action: "ops-settings.reward-compensation-presets.update",
      detail: { count: rewardCompensationPresets.length },
    });
    updated.rewardCompensationPresets = rewardCompensationPresets;
  }

  if (Object.keys(updated).length === 0) {
    return Response.json({ ok: false, error: "no setting provided" }, { status: 400 });
  }

  return Response.json({ ok: true, ...updated, updatedByEmail: adminEmail });
}
