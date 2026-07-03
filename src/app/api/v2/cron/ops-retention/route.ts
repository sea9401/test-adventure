import { inArray, lt } from "drizzle-orm";
import { db } from "@/db";
import { abuseEvents, economyEvents } from "@/db/schema";
import { requireCronAuth } from "@/lib/server/cronAuth";

const ABUSE_RETENTION_DAYS = 90;
const ECONOMY_RETENTION_DAYS = 180;
const MAX_DELETE_ROWS = 5_000;

function cutoffDate(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

// POST /api/v2/cron/ops-retention — 운영 로그 보관 기간 초과분 정리.
// 대량 delete 를 피하기 위해 1회 상한을 둔다. 오래 쌓였으면 다음 cron 이 이어서 처리한다.
export async function POST(req: Request) {
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;

  const abuseCutoff = cutoffDate(ABUSE_RETENTION_DAYS);
  const economyCutoff = cutoffDate(ECONOMY_RETENTION_DAYS);

  const abuseDue = await db
    .select({ id: abuseEvents.id })
    .from(abuseEvents)
    .where(lt(abuseEvents.createdAt, abuseCutoff))
    .limit(MAX_DELETE_ROWS);
  const economyDue = await db
    .select({ id: economyEvents.id })
    .from(economyEvents)
    .where(lt(economyEvents.createdAt, economyCutoff))
    .limit(MAX_DELETE_ROWS);

  const abuseDeleted =
    abuseDue.length > 0
      ? await db
          .delete(abuseEvents)
          .where(inArray(abuseEvents.id, abuseDue.map((row) => row.id)))
          .returning({ id: abuseEvents.id })
      : [];
  const economyDeleted =
    economyDue.length > 0
      ? await db
          .delete(economyEvents)
          .where(inArray(economyEvents.id, economyDue.map((row) => row.id)))
          .returning({ id: economyEvents.id })
      : [];

  return Response.json({
    ok: true,
    abuseRetentionDays: ABUSE_RETENTION_DAYS,
    economyRetentionDays: ECONOMY_RETENTION_DAYS,
    abuseDeleted: Math.min(abuseDeleted.length, abuseDue.length),
    economyDeleted: Math.min(economyDeleted.length, economyDue.length),
    abuseMore: abuseDue.length >= MAX_DELETE_ROWS,
    economyMore: economyDue.length >= MAX_DELETE_ROWS,
  });
}
