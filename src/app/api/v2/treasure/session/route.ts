import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import {
  TREASURE_SESSION_KEY,
  parseTreasureSession,
  toPublicSite,
} from "@/adventure/v2/treasureDig";

// GET /api/v2/treasure/session — 진행 중인 발굴 세션의 공개 뷰(매장지/골동품 비밀 제외).
// 발굴 화면이 마운트될 때 "이어서 발굴" 복원용 — open 과 달리 조각을 소비하지 않는 읽기 전용.
// 진행 중 세션이 없으면 site: null. (open 의 resume 경로와 동일한 toPublicSite 사용.)
export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const row = await db
    .select({ value: savesKv.value })
    .from(savesKv)
    .where(and(eq(savesKv.userId, userId), eq(savesKv.key, TREASURE_SESSION_KEY)))
    .limit(1)
    .then((rows) => rows[0]);

  const session = parseTreasureSession(row?.value);
  return Response.json({ ok: true, site: session ? toPublicSite(session) : null });
}
