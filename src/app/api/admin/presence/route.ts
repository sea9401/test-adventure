import { desc, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { presence, users } from "@/db/schema";
import { requireAdmin } from "@/lib/server/isAdmin";

export const ONLINE_WINDOW_SECONDS = 60;

export async function GET() {
  const gate = await requireAdmin();
  if (gate) return gate;

  const since = new Date(Date.now() - ONLINE_WINDOW_SECONDS * 1000);
  const rows = await db
    .select({
      userId: presence.userId,
      email: users.email,
      gameName: sql<string>`coalesce(${users.gameName}, ${presence.name})`,
      className: presence.className,
      title: presence.title,
      lastSeenAt: presence.lastSeenAt,
    })
    .from(presence)
    .innerJoin(users, eq(users.id, presence.userId))
    .where(gt(presence.lastSeenAt, since))
    .orderBy(desc(presence.lastSeenAt));

  return Response.json({
    generatedAt: new Date().toISOString(),
    onlineWindowSeconds: ONLINE_WINDOW_SECONDS,
    users: rows.map((row) => ({
      ...row,
      lastSeenAt:
        row.lastSeenAt instanceof Date
          ? row.lastSeenAt.toISOString()
          : String(row.lastSeenAt),
    })),
  });
}
