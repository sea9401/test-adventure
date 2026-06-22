import { gte, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { guildQuestInstances, guilds } from "@/db/schema";
import { requireAdmin, currentAdminEmail } from "@/lib/server/isAdmin";
import { logAdminAction } from "@/lib/server/adminAudit";
import { issueWeeklyProposals, thisWeekStartKST } from "@/lib/server/guildQuests";

type ReissueBody = { action: "reissue_week" };
type WipeBody = { action: "wipe_all" };
type ExpireBody = { action: "expire_open" };
type Body = ReissueBody | WipeBody | ExpireBody;

// GET — 길드 의뢰 인스턴스 현황 요약.
export async function GET() {
  const gate = await requireAdmin();
  if (gate) return gate;

  const weekStart = thisWeekStartKST();

  const byStatusRows = await db
    .select({
      status: guildQuestInstances.status,
      n: sql<number>`count(*)::int`,
    })
    .from(guildQuestInstances)
    .groupBy(guildQuestInstances.status);

  const byStatus: Record<string, number> = {};
  let total = 0;
  for (const r of byStatusRows) {
    byStatus[r.status] = r.n;
    total += r.n;
  }

  const [thisWeekRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(guildQuestInstances)
    .where(gte(guildQuestInstances.weekStart, weekStart));

  const [activeGuildRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(guilds)
    .where(isNull(guilds.disbandedAt));

  return Response.json({
    weekStart: weekStart.toISOString(),
    activeGuildCount: activeGuildRow?.n ?? 0,
    total,
    thisWeekCount: thisWeekRow?.n ?? 0,
    byStatus,
  });
}

// POST — reissue_week / wipe_all / expire_open.
export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (gate) return gate;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  if (
    body.action === "reissue_week" ||
    body.action === "wipe_all" ||
    body.action === "expire_open"
  ) {
    await logAdminAction({
      adminEmail: await currentAdminEmail(),
      action: `guild-quests.${body.action}`,
    });
  }

  if (body.action === "reissue_week") {
    const weekStart = thisWeekStartKST();
    // 이번 주(및 그 이후 날짜 — 정상적으로는 없음) 인스턴스 전부 삭제 후 새로 발행.
    const deleted = await db
      .delete(guildQuestInstances)
      .where(gte(guildQuestInstances.weekStart, weekStart))
      .returning({ id: guildQuestInstances.id });
    const { guildsProcessed, instancesIssued } =
      await issueWeeklyProposals(weekStart);
    return Response.json({
      ok: true,
      weekStart: weekStart.toISOString(),
      deleted: deleted.length,
      guildsProcessed,
      instancesIssued,
    });
  }

  if (body.action === "wipe_all") {
    const deleted = await db
      .delete(guildQuestInstances)
      .returning({ id: guildQuestInstances.id });
    return Response.json({ ok: true, deleted: deleted.length });
  }

  if (body.action === "expire_open") {
    // 마감 cron 과 동일: active 미완료 + proposed 미수락 → expired.
    const expiredActive = await db
      .update(guildQuestInstances)
      .set({ status: "expired" })
      .where(
        sql`${guildQuestInstances.status} = 'active' AND ${guildQuestInstances.progress} < ${guildQuestInstances.target}`,
      )
      .returning({ id: guildQuestInstances.id });
    const expiredProposed = await db
      .update(guildQuestInstances)
      .set({ status: "expired" })
      .where(sql`${guildQuestInstances.status} = 'proposed'`)
      .returning({ id: guildQuestInstances.id });
    return Response.json({
      ok: true,
      expiredActive: expiredActive.length,
      expiredProposed: expiredProposed.length,
    });
  }

  return new Response("unknown action", { status: 400 });
}
