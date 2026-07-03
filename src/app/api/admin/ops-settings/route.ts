import { eq } from "drizzle-orm";
import { db } from "@/db";
import { opsSettings } from "@/db/schema";
import { logAdminAction } from "@/lib/server/adminAudit";
import {
  currentAdminEmail,
  requireAdmin,
} from "@/lib/server/isAdmin";

const HOT_TIME_KEY = "hot-time.v1";

type HotTimeSettings = {
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

const DEFAULT_HOT_TIME: HotTimeSettings = {
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

export async function GET() {
  const gate = await requireAdmin();
  if (gate) return gate;

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

  return Response.json({
    ok: true,
    hotTime: parseHotTime(row?.value),
    updatedByEmail: row?.updatedByEmail ?? null,
    updatedAt: row?.updatedAt?.toISOString() ?? null,
  });
}

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (gate) return gate;

  const body = (await req.json().catch(() => null)) as unknown;
  const hotTime = parseHotTime(
    body && typeof body === "object"
      ? (body as { hotTime?: unknown }).hotTime
      : null,
  );
  const adminEmail = await currentAdminEmail();
  const now = new Date();

  await db
    .insert(opsSettings)
    .values({
      key: HOT_TIME_KEY,
      value: hotTime,
      updatedByEmail: adminEmail,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: opsSettings.key,
      set: {
        value: hotTime,
        updatedByEmail: adminEmail,
        updatedAt: now,
      },
    });

  await logAdminAction({
    adminEmail,
    action: "ops-settings.hot-time.update",
    detail: { enabled: hotTime.enabled, title: hotTime.title },
  });

  return Response.json({ ok: true, hotTime, updatedByEmail: adminEmail });
}

function parseHotTime(raw: unknown): HotTimeSettings {
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
