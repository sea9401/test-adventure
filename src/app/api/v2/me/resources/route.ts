import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { parseResources } from "@/adventure/data/v2/resources";

// GET /api/v2/me/resources — viewer 의 v2 자원 풀 조회.
// 응답: { resources: { stone: number } }
// row 없으면 모두 0.

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const row = (
    await db
      .select({ value: savesKv.value })
      .from(savesKv)
      .where(and(eq(savesKv.userId, userId), eq(savesKv.key, "v2-resources")))
      .limit(1)
  )[0];
  const resources = parseResources(row?.value ?? null);
  return Response.json({ ok: true, resources });
}
