import { logAdminAction } from "@/lib/server/adminAudit";
import {
  currentAdminEmail,
  requireAdmin,
} from "@/lib/server/isAdmin";
import {
  ALERT_THRESHOLDS_KEY,
  CODEX_MASTERY_FEATURES_KEY,
  HOT_TIME_KEY,
  HOT_TIME_SCHEDULES_KEY,
  LIFE_FIELD_FEATURES_KEY,
  OPS_NOTE_TEMPLATES_KEY,
  REWARD_COMPENSATION_PRESETS_KEY,
  parseAlertThresholds,
  parseCodexMasteryFeatureSettings,
  parseHotTime,
  parseHotTimeSchedules,
  parseLifeFieldFeatureSettings,
  parseOpsNoteTemplates,
  parseRewardCompensationPresets,
  readAlertThresholdSettings,
  readCodexMasteryFeatureSettings,
  readHotTimeSettings,
  readHotTimeSchedules,
  readLifeFieldFeatureSettings,
  readOpsNoteTemplates,
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
    {
      templates: opsNoteTemplates,
      updatedByEmail: opsNoteTemplatesUpdatedByEmail,
      updatedAt: opsNoteTemplatesUpdatedAt,
    },
    lifeFieldFeatures,
    codexMasteryFeatures,
  ] = await Promise.all([
    readHotTimeSettings(),
    readHotTimeSchedules(),
    readAlertThresholdSettings(),
    readRewardCompensationPresets(),
    readOpsNoteTemplates(),
    readLifeFieldFeatureSettings(),
    readCodexMasteryFeatureSettings(),
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
    opsNoteTemplates,
    opsNoteTemplatesUpdatedByEmail,
    opsNoteTemplatesUpdatedAt: opsNoteTemplatesUpdatedAt?.toISOString() ?? null,
    lifeFieldFeatures,
    codexMasteryFeatures,
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
        opsNoteTemplates?: unknown;
        lifeFieldFeatures?: unknown;
        codexMasteryFeatures?: unknown;
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

  if ("opsNoteTemplates" in body) {
    const opsNoteTemplates = parseOpsNoteTemplates(body.opsNoteTemplates);
    await upsertOpsSetting(OPS_NOTE_TEMPLATES_KEY, opsNoteTemplates, adminEmail, now);
    await logAdminAction({
      adminEmail,
      action: "ops-settings.ops-note-templates.update",
      detail: { count: opsNoteTemplates.length },
    });
    updated.opsNoteTemplates = opsNoteTemplates;
  }

  if ("lifeFieldFeatures" in body) {
    const lifeFieldFeatures = parseLifeFieldFeatureSettings(
      body.lifeFieldFeatures,
    );
    await upsertOpsSetting(
      LIFE_FIELD_FEATURES_KEY,
      lifeFieldFeatures,
      adminEmail,
      now,
    );
    await logAdminAction({
      adminEmail,
      action: "ops-settings.life-field-features.update",
      detail: lifeFieldFeatures,
    });
    updated.lifeFieldFeatures = lifeFieldFeatures;
  }

  if ("codexMasteryFeatures" in body) {
    const codexMasteryFeatures = parseCodexMasteryFeatureSettings(
      body.codexMasteryFeatures,
    );
    await upsertOpsSetting(
      CODEX_MASTERY_FEATURES_KEY,
      codexMasteryFeatures,
      adminEmail,
      now,
    );
    await logAdminAction({
      adminEmail,
      action: "ops-settings.codex-mastery-features.update",
      detail: codexMasteryFeatures,
    });
    updated.codexMasteryFeatures = codexMasteryFeatures;
  }

  if (Object.keys(updated).length === 0) {
    return Response.json({ ok: false, error: "no setting provided" }, { status: 400 });
  }

  return Response.json({ ok: true, ...updated, updatedByEmail: adminEmail });
}
