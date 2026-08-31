import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { getAdminEmailsList } from "@/lib/server/isAdmin";
import { readCodexMasteryFeatureSettings } from "@/lib/server/opsSettings";
import { readCodexResearchRanking } from "@/lib/server/codexResearchRanking";

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const settings = await readCodexMasteryFeatureSettings(db);
  if (!settings.monthlyRankingVisible) {
    return Response.json({ ok: true, enabled: false });
  }
  const ranking = await readCodexResearchRanking(db, {
    viewerUserId: userId,
    adminEmails: getAdminEmailsList(),
  });
  return Response.json({ ok: true, enabled: true, ...ranking });
}
