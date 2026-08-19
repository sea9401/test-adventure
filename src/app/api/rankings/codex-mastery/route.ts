import { db } from "@/db";
import { isCodexMasteryRankingScope } from "@/adventure/data/v2/codexMasteryRanking";
import { ensureUser } from "@/lib/server/ensureUser";
import { getAdminEmailsList } from "@/lib/server/isAdmin";
import { readCodexMasteryFeatureSettings } from "@/lib/server/opsSettings";
import { readCodexMasteryRanking } from "@/lib/server/codexMasteryRanking";

export async function GET(request: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const requestedScopes = new URL(request.url).searchParams.getAll("scope");
  const scope = requestedScopes.length === 0 ? "overall" : requestedScopes[0];
  if (requestedScopes.length > 1 || !isCodexMasteryRankingScope(scope)) {
    return Response.json({ ok: false, error: "invalid_scope" }, { status: 400 });
  }

  const settings = await readCodexMasteryFeatureSettings(db);
  if (!settings.rankingVisible) {
    return Response.json({ ok: true, enabled: false });
  }

  const ranking = await readCodexMasteryRanking(db, {
    viewerUserId: userId,
    scope,
    adminEmails: getAdminEmailsList(),
  });
  return Response.json({
    ok: true,
    enabled: true,
    scope,
    ...ranking,
  });
}
