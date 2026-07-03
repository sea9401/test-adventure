import { eq } from "drizzle-orm";
import { db } from "@/db";
import { opsSettings } from "@/db/schema";

export const HOT_TIME_KEY = "hot-time.v1";

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

function defaultHotTimeRead() {
  return {
    hotTime: DEFAULT_HOT_TIME,
    updatedByEmail: null,
    updatedAt: null,
  };
}

export async function readActiveHotTime(
  now = Date.now(),
): Promise<ActiveHotTime> {
  const { hotTime } = await readHotTimeSettings();
  return { ...hotTime, active: isHotTimeActive(hotTime, now) };
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

export function applyPctBonus(value: number, pct: number) {
  if (value <= 0 || pct <= 0) return Math.max(0, Math.floor(value));
  return Math.max(0, Math.floor(value * (100 + pct) / 100));
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

function textValue(raw: unknown, max: number): string {
  return typeof raw === "string" ? raw.trim().slice(0, max) : "";
}

function dateTextValue(raw: unknown): string {
  if (typeof raw !== "string" || raw.trim() === "") return "";
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d.toISOString() : "";
}

function pctValue(raw: unknown): number {
  const value = Number(raw ?? 0);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(500, Math.floor(value)));
}
