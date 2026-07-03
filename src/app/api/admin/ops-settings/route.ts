import { db } from "@/db";
import { opsSettings } from "@/db/schema";
import { logAdminAction } from "@/lib/server/adminAudit";
import {
  currentAdminEmail,
  requireAdmin,
} from "@/lib/server/isAdmin";
import {
  HOT_TIME_KEY,
  parseHotTime,
  readHotTimeSettings,
} from "@/lib/server/opsSettings";

export async function GET() {
  const gate = await requireAdmin();
  if (gate) return gate;

  const { hotTime, updatedByEmail, updatedAt } = await readHotTimeSettings();

  return Response.json({
    ok: true,
    hotTime,
    updatedByEmail,
    updatedAt: updatedAt?.toISOString() ?? null,
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
