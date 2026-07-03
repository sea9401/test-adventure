import { desc } from "drizzle-orm";
import { db } from "@/db";
import { abuseEvents, adminAuditLog, economyEvents, opsSettings } from "@/db/schema";
import { requireCronAuth } from "@/lib/server/cronAuth";
import { readHotTimeSettings } from "@/lib/server/opsSettings";

export async function POST(req: Request) {
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;

  const [hotTime, economy, abuse, audit, settings] = await Promise.all([
    readHotTimeSettings(),
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

  return Response.json({
    ok: true,
    hotTimeEnabled: hotTime.hotTime.enabled,
    economyReadable: Array.isArray(economy),
    abuseReadable: Array.isArray(abuse),
    auditReadable: Array.isArray(audit),
    settingsReadable: Array.isArray(settings),
  });
}
