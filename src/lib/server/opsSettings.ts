import { eq, inArray } from "drizzle-orm";
import { applyStochasticPercentBonus } from "@/lib/percentBonus";
import { db } from "@/db";
import { opsSettings } from "@/db/schema";
import type { DbExecutor } from "@/lib/server/savesKv";

export const HOT_TIME_KEY = "hot-time.v1";
export const HOT_TIME_SCHEDULES_KEY = "hot-time-schedules.v1";
export const ALERT_THRESHOLDS_KEY = "ops-alert-thresholds.v1";
export const OPS_ALERT_HISTORY_KEY = "ops-alert-history.v1";
export const REWARD_FAILURE_STATUS_KEY = "reward-failure-status.v1";
export const REWARD_COMPENSATION_PRESETS_KEY = "reward-compensation-presets.v1";
export const OPS_NOTE_TEMPLATES_KEY = "ops-note-templates.v1";
export const LIFE_FIELD_FEATURES_KEY = "life-field-features.v1";
export const CODEX_MASTERY_FEATURES_KEY = "codex-mastery-features.v1";

export type LifeFieldFeatureSettings = {
  environmentEnabled: boolean;
  discoveriesEnabled: boolean;
  discoveryRewardsEnabled: boolean;
  feedEnabled: boolean;
  milestonesEnabled: boolean;
};

export const DEFAULT_LIFE_FIELD_FEATURES: LifeFieldFeatureSettings = {
  environmentEnabled: true,
  discoveriesEnabled: true,
  discoveryRewardsEnabled: true,
  feedEnabled: true,
  milestonesEnabled: true,
};

export type CodexMasteryFeatureSettings = {
  recordingEnabled: boolean;
  rankingVisible: boolean;
  sealsEnabled: boolean;
  trophiesEnabled: boolean;
  monthlyProgressEnabled: boolean;
  monthlyRankingVisible: boolean;
  settlementEnabled: boolean;
  feedEnabled: boolean;
};

export const DEFAULT_CODEX_MASTERY_FEATURES: CodexMasteryFeatureSettings = {
  recordingEnabled: false,
  rankingVisible: false,
  sealsEnabled: false,
  trophiesEnabled: false,
  monthlyProgressEnabled: false,
  monthlyRankingVisible: false,
  settlementEnabled: false,
  feedEnabled: false,
};

export type HotTimeSettings = {
  enabled: boolean;
  title: string;
  startsAt: string;
  endsAt: string;
  bonuses: {
    goldPct: number;
    expPct: number;
    masteryPct: number;
    fishingCoinPct: number;
  };
  note: string;
};

export type ActiveHotTime = HotTimeSettings & {
  active: boolean;
  source: "manual" | "schedule" | null;
  scheduleId?: string;
};

export type HotTimeSchedule = {
  id: string;
  enabled: boolean;
  title: string;
  days: number[];
  startsAt: string;
  endsAt: string;
  bonuses: HotTimeSettings["bonuses"];
  note: string;
};

export type AlertThresholdSettings = {
  abuseLast5m: number;
  abuseLast1h: number;
  rewardFailures: number;
  largeGoldEvents: number;
  adminAudit: number;
  repeatUserEvents: number;
  connectedIpUsers: number;
  topActionEvents: number;
};

export type OpsAlertHistoryEntry = {
  id: string;
  message: string;
  detail: Record<string, unknown> | null;
  status: "sent" | "failed" | "skipped";
  error: string | null;
  createdAt: string;
};

export type RewardFailureStatus = "reviewed" | "compensated" | "ignored";

export type RewardFailureStatusEntry = {
  eventId: number;
  status: RewardFailureStatus;
  note: string;
  adminEmail: string;
  updatedAt: string;
};

export type RewardCompensationPreset = {
  id: string;
  label: string;
  itemKind:
    | "gold"
    | "fishing_coin"
    | "mastery_certificate"
    | "stamina_potion"
    | "material";
  itemId: string;
  quantity: number;
  reason: string;
};

export type OpsNoteTemplate = {
  id: string;
  label: string;
  text: string;
};

export const DEFAULT_HOT_TIME: HotTimeSettings = {
  enabled: false,
  title: "",
  startsAt: "",
  endsAt: "",
  bonuses: {
    goldPct: 0,
    expPct: 0,
    masteryPct: 0,
    fishingCoinPct: 0,
  },
  note: "",
};

export const DEFAULT_ALERT_THRESHOLDS: AlertThresholdSettings = {
  abuseLast5m: 20,
  abuseLast1h: 50,
  rewardFailures: 5,
  largeGoldEvents: 3,
  adminAudit: 30,
  repeatUserEvents: 30,
  connectedIpUsers: 3,
  topActionEvents: 80,
};

export const DEFAULT_REWARD_COMPENSATION_PRESETS: RewardCompensationPreset[] = [
  {
    id: "fishing-coin-missing",
    label: "낚시 코인 미지급",
    itemKind: "fishing_coin",
    itemId: "",
    quantity: 100,
    reason: "낚시 코인 미지급 보정",
  },
  {
    id: "mastery-certificate-missing",
    label: "숙련 증서 미지급",
    itemKind: "mastery_certificate",
    itemId: "",
    quantity: 1,
    reason: "숙련 증서 미지급 보정",
  },
  {
    id: "stamina-potion-missing",
    label: "스태미나 회복약",
    itemKind: "stamina_potion",
    itemId: "",
    quantity: 1,
    reason: "스태미나 회복약 미지급 보정",
  },
  {
    id: "material-adjust",
    label: "재료 보정",
    itemKind: "material",
    itemId: "",
    quantity: 1,
    reason: "재료 미지급 보정",
  },
];

export const DEFAULT_OPS_NOTE_TEMPLATES: OpsNoteTemplate[] = [
  {
    id: "daily-limit",
    label: "일일 제한 안내",
    text: "일일 획득 제한 관련 문의. 오늘 획득량, 남은 한도, 최근 보상 로그를 확인했고 제한 도달 가능성을 우선 안내.",
  },
  {
    id: "reward-review",
    label: "보상 검토",
    text: "보상 미지급 문의 접수. 원본 event id, 최근 수령 기록, 동일 품목 보정 이력, 중복 지급 위험을 확인해야 함.",
  },
  {
    id: "compensated",
    label: "보정 완료",
    text: "운영 보정 지급 완료. 지급 품목, 수량, 사유, 원본 event id를 보정 지급 기록과 감사 로그에 남김.",
  },
  {
    id: "abuse-watch",
    label: "이상 행동 관찰",
    text: "반복 요청 또는 비정상 패턴 의심. 즉시 제재 전 요청 간격, IP 공유, 보상 실패 반복 여부를 추가 관찰.",
  },
  {
    id: "correction",
    label: "정정 처리",
    text: "이전 처리 정정 필요. 기존 지급/제재/메모 근거를 확인하고 정정 사유를 별도 메모로 남김.",
  },
];

export async function readHotTimeSettings(): Promise<{
  hotTime: HotTimeSettings;
  updatedByEmail: string | null;
  updatedAt: Date | null;
}> {
  if (typeof (db as { select?: unknown }).select !== "function") {
    return defaultHotTimeRead();
  }

  const row = (
    await db
      .select({
        value: opsSettings.value,
        updatedByEmail: opsSettings.updatedByEmail,
        updatedAt: opsSettings.updatedAt,
      })
      .from(opsSettings)
      .where(eq(opsSettings.key, HOT_TIME_KEY))
      .limit(1)
  )[0];
  return {
    hotTime: parseHotTime(row?.value),
    updatedByEmail: row?.updatedByEmail ?? null,
    updatedAt: row?.updatedAt ?? null,
  };
}

export async function readHotTimeSchedules(): Promise<{
  schedules: HotTimeSchedule[];
  updatedByEmail: string | null;
  updatedAt: Date | null;
}> {
  const row = await readSettingRow(HOT_TIME_SCHEDULES_KEY);
  return {
    schedules: parseHotTimeSchedules(row?.value),
    updatedByEmail: row?.updatedByEmail ?? null,
    updatedAt: row?.updatedAt ?? null,
  };
}

export async function readAlertThresholdSettings(): Promise<{
  alertThresholds: AlertThresholdSettings;
  updatedByEmail: string | null;
  updatedAt: Date | null;
}> {
  const row = await readSettingRow(ALERT_THRESHOLDS_KEY);
  return {
    alertThresholds: parseAlertThresholds(row?.value),
    updatedByEmail: row?.updatedByEmail ?? null,
    updatedAt: row?.updatedAt ?? null,
  };
}

export async function readOpsAlertHistory(): Promise<OpsAlertHistoryEntry[]> {
  const row = await readSettingRow(OPS_ALERT_HISTORY_KEY);
  return parseOpsAlertHistory(row?.value);
}

export async function readRewardFailureStatuses(): Promise<RewardFailureStatusEntry[]> {
  const row = await readSettingRow(REWARD_FAILURE_STATUS_KEY);
  return parseRewardFailureStatuses(row?.value);
}

export async function writeRewardFailureStatuses(
  entries: RewardFailureStatusEntry[],
  adminEmail: string,
  updatedAt = new Date(),
) {
  await upsertOpsSetting(
    REWARD_FAILURE_STATUS_KEY,
    entries.slice(0, 500),
    adminEmail,
    updatedAt,
  );
}

export async function readRewardCompensationPresets(): Promise<{
  presets: RewardCompensationPreset[];
  updatedByEmail: string | null;
  updatedAt: Date | null;
}> {
  const row = await readSettingRow(REWARD_COMPENSATION_PRESETS_KEY);
  return {
    presets: parseRewardCompensationPresets(row?.value),
    updatedByEmail: row?.updatedByEmail ?? null,
    updatedAt: row?.updatedAt ?? null,
  };
}

export async function readOpsNoteTemplates(): Promise<{
  templates: OpsNoteTemplate[];
  updatedByEmail: string | null;
  updatedAt: Date | null;
}> {
  const row = await readSettingRow(OPS_NOTE_TEMPLATES_KEY);
  return {
    templates: parseOpsNoteTemplates(row?.value),
    updatedByEmail: row?.updatedByEmail ?? null,
    updatedAt: row?.updatedAt ?? null,
  };
}

export function parseLifeFieldFeatureSettings(
  raw: unknown,
): LifeFieldFeatureSettings {
  const value =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return {
    environmentEnabled:
      typeof value.environmentEnabled === "boolean"
        ? value.environmentEnabled
        : DEFAULT_LIFE_FIELD_FEATURES.environmentEnabled,
    discoveriesEnabled:
      typeof value.discoveriesEnabled === "boolean"
        ? value.discoveriesEnabled
        : DEFAULT_LIFE_FIELD_FEATURES.discoveriesEnabled,
    discoveryRewardsEnabled:
      typeof value.discoveryRewardsEnabled === "boolean"
        ? value.discoveryRewardsEnabled
        : DEFAULT_LIFE_FIELD_FEATURES.discoveryRewardsEnabled,
    feedEnabled:
      typeof value.feedEnabled === "boolean"
        ? value.feedEnabled
        : DEFAULT_LIFE_FIELD_FEATURES.feedEnabled,
    milestonesEnabled:
      typeof value.milestonesEnabled === "boolean"
        ? value.milestonesEnabled
        : DEFAULT_LIFE_FIELD_FEATURES.milestonesEnabled,
  };
}

export async function readLifeFieldFeatureSettings(
  executor: DbExecutor = db,
): Promise<LifeFieldFeatureSettings> {
  if (typeof (executor as { select?: unknown }).select !== "function") {
    return DEFAULT_LIFE_FIELD_FEATURES;
  }
  const row = (
    await executor
      .select({ value: opsSettings.value })
      .from(opsSettings)
      .where(eq(opsSettings.key, LIFE_FIELD_FEATURES_KEY))
      .limit(1)
  )[0];
  return parseLifeFieldFeatureSettings(row?.value);
}

export function parseCodexMasteryFeatureSettings(
  raw: unknown,
): CodexMasteryFeatureSettings {
  const value =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return {
    recordingEnabled:
      typeof value.recordingEnabled === "boolean"
        ? value.recordingEnabled
        : DEFAULT_CODEX_MASTERY_FEATURES.recordingEnabled,
    rankingVisible:
      typeof value.rankingVisible === "boolean"
        ? value.rankingVisible
        : DEFAULT_CODEX_MASTERY_FEATURES.rankingVisible,
    sealsEnabled:
      typeof value.sealsEnabled === "boolean"
        ? value.sealsEnabled
        : DEFAULT_CODEX_MASTERY_FEATURES.sealsEnabled,
    trophiesEnabled:
      typeof value.trophiesEnabled === "boolean"
        ? value.trophiesEnabled
        : DEFAULT_CODEX_MASTERY_FEATURES.trophiesEnabled,
    monthlyProgressEnabled:
      typeof value.monthlyProgressEnabled === "boolean"
        ? value.monthlyProgressEnabled
        : DEFAULT_CODEX_MASTERY_FEATURES.monthlyProgressEnabled,
    monthlyRankingVisible:
      typeof value.monthlyRankingVisible === "boolean"
        ? value.monthlyRankingVisible
        : DEFAULT_CODEX_MASTERY_FEATURES.monthlyRankingVisible,
    settlementEnabled:
      typeof value.settlementEnabled === "boolean"
        ? value.settlementEnabled
        : DEFAULT_CODEX_MASTERY_FEATURES.settlementEnabled,
    feedEnabled:
      typeof value.feedEnabled === "boolean"
        ? value.feedEnabled
        : DEFAULT_CODEX_MASTERY_FEATURES.feedEnabled,
  };
}

export async function readCodexMasteryFeatureSettings(
  executor: DbExecutor = db,
): Promise<CodexMasteryFeatureSettings> {
  if (typeof (executor as { select?: unknown }).select !== "function") {
    return DEFAULT_CODEX_MASTERY_FEATURES;
  }
  const row = (
    await executor
      .select({ value: opsSettings.value })
      .from(opsSettings)
      .where(eq(opsSettings.key, CODEX_MASTERY_FEATURES_KEY))
      .limit(1)
  )[0];
  return parseCodexMasteryFeatureSettings(row?.value);
}

export async function upsertOpsSetting(
  key: string,
  value: unknown,
  updatedByEmail: string,
  updatedAt = new Date(),
) {
  await db
    .insert(opsSettings)
    .values({
      key,
      value,
      updatedByEmail,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: opsSettings.key,
      set: { value, updatedByEmail, updatedAt },
    });
}

async function readSettingRow(key: string): Promise<{
  value: unknown;
  updatedByEmail: string | null;
  updatedAt: Date | null;
} | null> {
  if (typeof (db as { select?: unknown }).select !== "function") {
    return null;
  }
  return (
    await db
      .select({
        value: opsSettings.value,
        updatedByEmail: opsSettings.updatedByEmail,
        updatedAt: opsSettings.updatedAt,
      })
      .from(opsSettings)
      .where(eq(opsSettings.key, key))
      .limit(1)
  )[0] ?? null;
}

function defaultHotTimeRead() {
  return {
    hotTime: DEFAULT_HOT_TIME,
    updatedByEmail: null,
    updatedAt: null,
  };
}

export async function readActiveHotTime(
  now = Date.now(),
  executor: DbExecutor = db,
): Promise<ActiveHotTime> {
  // 전투/낚시처럼 이미 트랜잭션 커넥션을 쥔 호출부는 반드시 그 executor를 넘긴다.
  // 전역 db로 두 설정을 병렬 조회하면 요청 하나가 풀 커넥션을 추가로 요구해, 풀이 찬 순간
  // 모든 트랜잭션이 두 번째 커넥션을 기다리는 교착성 고갈이 생길 수 있다. 두 키를 한 쿼리로
  // 읽으면 요청당 왕복도 2→1로 줄고 같은 tx 커넥션에서 안전하게 순차 실행된다.
  if (typeof (executor as { select?: unknown }).select !== "function") {
    return { ...DEFAULT_HOT_TIME, active: false, source: null };
  }
  const rows = await executor
    .select({ key: opsSettings.key, value: opsSettings.value })
    .from(opsSettings)
    .where(inArray(opsSettings.key, [HOT_TIME_KEY, HOT_TIME_SCHEDULES_KEY]))
    .limit(2);
  const values = new Map(rows.map((row) => [row.key, row.value]));
  const hotTime = parseHotTime(values.get(HOT_TIME_KEY));
  const schedules = parseHotTimeSchedules(values.get(HOT_TIME_SCHEDULES_KEY));
  if (isHotTimeActive(hotTime, now)) {
    return { ...hotTime, active: true, source: "manual" };
  }
  const schedule = schedules.find((row) => isHotTimeScheduleActive(row, now));
  if (schedule) {
    return {
      enabled: true,
      title: schedule.title,
      startsAt: schedule.startsAt,
      endsAt: schedule.endsAt,
      bonuses: schedule.bonuses,
      note: schedule.note,
      active: true,
      source: "schedule",
      scheduleId: schedule.id,
    };
  }
  return { ...hotTime, active: false, source: null };
}

export function isHotTimeActive(hotTime: HotTimeSettings, now = Date.now()) {
  if (!hotTime.enabled) return false;
  const start = Date.parse(hotTime.startsAt);
  const end = Date.parse(hotTime.endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
    return false;
  }
  return start <= now && now < end;
}

export function applyPctBonus(
  value: number,
  pct: number,
  rng: () => number = Math.random,
) {
  return applyStochasticPercentBonus(value, pct, rng);
}

export function bonusDelta(before: number, after: number) {
  return Math.max(0, Math.floor(after) - Math.max(0, Math.floor(before)));
}

export function parseHotTime(raw: unknown): HotTimeSettings {
  const r =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const bonuses =
    r.bonuses && typeof r.bonuses === "object" && !Array.isArray(r.bonuses)
      ? (r.bonuses as Record<string, unknown>)
      : {};
  return {
    ...DEFAULT_HOT_TIME,
    enabled: Boolean(r.enabled),
    title: textValue(r.title, 80),
    startsAt: dateTextValue(r.startsAt),
    endsAt: dateTextValue(r.endsAt),
    bonuses: {
      goldPct: pctValue(bonuses.goldPct),
      expPct: pctValue(bonuses.expPct),
      masteryPct: pctValue(bonuses.masteryPct),
      fishingCoinPct: pctValue(bonuses.fishingCoinPct),
    },
    note: textValue(r.note, 500),
  };
}

export function parseHotTimeSchedules(raw: unknown): HotTimeSchedule[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { schedules?: unknown }).schedules)
      ? (raw as { schedules: unknown[] }).schedules
      : [];
  return list
    .slice(0, 20)
    .map((entry, index) => parseHotTimeSchedule(entry, index))
    .filter((row): row is HotTimeSchedule => row != null);
}

function parseHotTimeSchedule(raw: unknown, index: number): HotTimeSchedule | null {
  const r =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const days = Array.isArray(r.days)
    ? [...new Set(r.days.map((day) => Number(day)).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))]
    : [];
  const id = textValue(r.id, 80) || `schedule-${index + 1}`;
  const startsAt = timeTextValue(r.startsAt);
  const endsAt = timeTextValue(r.endsAt);
  if (days.length === 0 || !startsAt || !endsAt || startsAt >= endsAt) return null;
  const parsed = parseHotTime({ ...r, startsAt: "", endsAt: "" });
  return {
    id,
    enabled: Boolean(r.enabled),
    title: textValue(r.title, 80),
    days,
    startsAt,
    endsAt,
    bonuses: parsed.bonuses,
    note: textValue(r.note, 500),
  };
}

export function parseAlertThresholds(raw: unknown): AlertThresholdSettings {
  const r =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return {
    abuseLast5m: thresholdValue(r.abuseLast5m, DEFAULT_ALERT_THRESHOLDS.abuseLast5m),
    abuseLast1h: thresholdValue(r.abuseLast1h, DEFAULT_ALERT_THRESHOLDS.abuseLast1h),
    rewardFailures: thresholdValue(r.rewardFailures, DEFAULT_ALERT_THRESHOLDS.rewardFailures),
    largeGoldEvents: thresholdValue(r.largeGoldEvents, DEFAULT_ALERT_THRESHOLDS.largeGoldEvents),
    adminAudit: thresholdValue(r.adminAudit, DEFAULT_ALERT_THRESHOLDS.adminAudit),
    repeatUserEvents: thresholdValue(r.repeatUserEvents, DEFAULT_ALERT_THRESHOLDS.repeatUserEvents),
    connectedIpUsers: thresholdValue(r.connectedIpUsers, DEFAULT_ALERT_THRESHOLDS.connectedIpUsers),
    topActionEvents: thresholdValue(r.topActionEvents, DEFAULT_ALERT_THRESHOLDS.topActionEvents),
  };
}

export function parseOpsAlertHistory(raw: unknown): OpsAlertHistoryEntry[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { entries?: unknown }).entries)
      ? (raw as { entries: unknown[] }).entries
      : [];
  return list
    .map((entry) => {
      const r =
        entry && typeof entry === "object" && !Array.isArray(entry)
          ? (entry as Record<string, unknown>)
          : {};
      const status: OpsAlertHistoryEntry["status"] =
        r.status === "sent" || r.status === "failed" || r.status === "skipped"
          ? r.status
          : "skipped";
      return {
        id: textValue(r.id, 80),
        message: textValue(r.message, 300),
        detail:
          r.detail && typeof r.detail === "object" && !Array.isArray(r.detail)
            ? (r.detail as Record<string, unknown>)
            : null,
        status,
        error: typeof r.error === "string" ? r.error.slice(0, 300) : null,
        createdAt: dateTextValue(r.createdAt),
      };
    })
    .filter((entry) => entry.id && entry.message && entry.createdAt)
    .slice(0, 100);
}

export function parseRewardFailureStatuses(raw: unknown): RewardFailureStatusEntry[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { entries?: unknown }).entries)
      ? (raw as { entries: unknown[] }).entries
      : [];
  const byEvent = new Map<number, RewardFailureStatusEntry>();
  for (const entry of list) {
    const r =
      entry && typeof entry === "object" && !Array.isArray(entry)
        ? (entry as Record<string, unknown>)
        : {};
    const eventId = positiveInt(r.eventId, 0, 2_147_483_647);
    const status = parseRewardFailureStatus(r.status);
    const updatedAt = dateTextValue(r.updatedAt);
    if (!eventId || !status || !updatedAt) continue;
    byEvent.set(eventId, {
      eventId,
      status,
      note: textValue(r.note, 500),
      adminEmail: textValue(r.adminEmail, 160) || "unknown",
      updatedAt,
    });
  }
  return [...byEvent.values()]
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, 500);
}

export function parseRewardCompensationPresets(raw: unknown): RewardCompensationPreset[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { presets?: unknown }).presets)
      ? (raw as { presets: unknown[] }).presets
      : DEFAULT_REWARD_COMPENSATION_PRESETS;
  const parsed = list.slice(0, 20).map(parseRewardCompensationPreset).filter((row): row is RewardCompensationPreset => row != null);
  return parsed.length > 0 ? parsed : DEFAULT_REWARD_COMPENSATION_PRESETS;
}

export function parseOpsNoteTemplates(raw: unknown): OpsNoteTemplate[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { templates?: unknown }).templates)
      ? (raw as { templates: unknown[] }).templates
      : DEFAULT_OPS_NOTE_TEMPLATES;
  const parsed = list
    .slice(0, 30)
    .map(parseOpsNoteTemplate)
    .filter((row): row is OpsNoteTemplate => row != null);
  return parsed.length > 0 ? parsed : DEFAULT_OPS_NOTE_TEMPLATES;
}

function parseOpsNoteTemplate(raw: unknown): OpsNoteTemplate | null {
  const r =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const label = textValue(r.label, 40);
  const id = textValue(r.id, 80) || label.toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
  const text = textValue(r.text, 1_000);
  if (!id || !label || !text) return null;
  return { id, label, text };
}

function parseRewardCompensationPreset(raw: unknown): RewardCompensationPreset | null {
  const r =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const itemKind = parseRewardItemKind(r.itemKind);
  const label = textValue(r.label, 40);
  const id = textValue(r.id, 80) || label.toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
  const quantity = positiveInt(r.quantity, 0, 1_000_000_000);
  if (!id || !label || !itemKind || quantity <= 0) return null;
  return {
    id,
    label,
    itemKind,
    itemId: textValue(r.itemId, 160),
    quantity,
    reason: textValue(r.reason, 500),
  };
}

function textValue(raw: unknown, max: number): string {
  return typeof raw === "string" ? raw.trim().slice(0, max) : "";
}

function dateTextValue(raw: unknown): string {
  if (typeof raw !== "string" || raw.trim() === "") return "";
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d.toISOString() : "";
}

function timeTextValue(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const value = raw.trim();
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : "";
}

function pctValue(raw: unknown): number {
  const value = Number(raw ?? 0);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(500, Math.floor(value)));
}

function positiveInt(raw: unknown, fallback: number, max: number): number {
  const value = Number(raw ?? fallback);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(max, Math.floor(value)));
}

function parseRewardFailureStatus(raw: unknown): RewardFailureStatus | null {
  return raw === "reviewed" || raw === "compensated" || raw === "ignored"
    ? raw
    : null;
}

function parseRewardItemKind(raw: unknown): RewardCompensationPreset["itemKind"] | null {
  return raw === "gold" ||
    raw === "fishing_coin" ||
    raw === "mastery_certificate" ||
    raw === "stamina_potion" ||
    raw === "material"
    ? raw
    : null;
}

function thresholdValue(raw: unknown, fallback: number): number {
  const value = Number(raw ?? fallback);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(100_000, Math.floor(value)));
}

function isHotTimeScheduleActive(schedule: HotTimeSchedule, now = Date.now()) {
  if (!schedule.enabled) return false;
  const date = new Date(now);
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const day = kst.getUTCDay();
  const hh = String(kst.getUTCHours()).padStart(2, "0");
  const mm = String(kst.getUTCMinutes()).padStart(2, "0");
  const current = `${hh}:${mm}`;
  return schedule.days.includes(day) && schedule.startsAt <= current && current < schedule.endsAt;
}
