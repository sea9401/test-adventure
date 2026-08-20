import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { readCodexMasteryFeatureSettings } from "@/lib/server/opsSettings";
import { readCodexResearchArchive } from "@/lib/server/codexResearchArchive";

const SEASON_ID = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function GET(request: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const settings = await readCodexMasteryFeatureSettings(db);
  if (!settings.monthlyRankingVisible || !settings.trophiesEnabled) {
    return Response.json({ ok: true, enabled: false });
  }
  const seasonId = new URL(request.url).searchParams.get("seasonId") ?? undefined;
  if (seasonId !== undefined && !SEASON_ID.test(seasonId)) {
    return Response.json({ ok: false, error: "invalid_season_id" }, { status: 400 });
  }
  const archive = await readCodexResearchArchive(db, { viewerUserId: userId, seasonId });
  return Response.json({ ok: true, enabled: true, ...archive });
}
