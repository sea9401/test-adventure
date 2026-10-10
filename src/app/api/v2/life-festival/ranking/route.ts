// GET /api/v2/life-festival/ranking?week=current|previous — 생활 축제 주간 순위 상위 30명과 내 순위.

import { db } from "@/db";
import { previousLifeFestivalWeekId } from "@/adventure/v2/lifeFestival";
import { kstWeekMondayKey } from "@/lib/kst";
import { ensureUser } from "@/lib/server/ensureUser";
import { readLifeFestivalRanking } from "@/lib/server/lifeFestival/scores";

export async function GET(req: Request) {
  const week = new URL(req.url).searchParams.get("week") ?? "current";
  if (week !== "current" && week !== "previous") {
    return Response.json({ ok: false, error: "invalid_week" }, { status: 400 });
  }
  const userId = await ensureUser();
  if (!userId) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const now = new Date(Date.now());
  const currentWeekId = kstWeekMondayKey(now);
  const weekId = week === "previous" ? previousLifeFestivalWeekId(currentWeekId) : currentWeekId;
  const ranking = await readLifeFestivalRanking(db, weekId, userId, now);
  return Response.json({ ok: true, weekId, ...ranking });
}
