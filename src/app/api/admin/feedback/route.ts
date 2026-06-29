import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { feedbackReports, users } from "@/db/schema";
import { requireAdmin } from "@/lib/server/isAdmin";

// GET /api/admin/feedback — 유저 건의사항 최신순 조회. requireAdmin 게이트.
//   ?limit=  (기본 100, 최대 500)
export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (gate) return gate;

  const sp = new URL(req.url).searchParams;
  const limit = Math.min(Math.max(Number(sp.get("limit")) || 100, 1), 500);

  const entries = await db
    .select({
      id: feedbackReports.id,
      userId: feedbackReports.userId,
      actorName: feedbackReports.actorName,
      currentGameName: users.gameName,
      email: users.email,
      category: feedbackReports.category,
      content: feedbackReports.content,
      path: feedbackReports.path,
      status: feedbackReports.status,
      createdAt: feedbackReports.createdAt,
    })
    .from(feedbackReports)
    .leftJoin(users, eq(users.id, feedbackReports.userId))
    .orderBy(desc(feedbackReports.id))
    .limit(limit);

  return Response.json({ ok: true, entries });
}
