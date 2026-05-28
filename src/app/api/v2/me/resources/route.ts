import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { getGuildId } from "@/lib/server/v2EnsureSoloGuild";
import { readGuildResources } from "@/lib/server/v2GuildResources";

// GET /api/v2/me/resources — viewer 의 길드 공용 자원 풀 조회.
// 무소속이면 resources=null.

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const resources = await db.transaction(async (tx) => {
    const guildId = await getGuildId(tx, userId);
    if (guildId == null) return null;
    return readGuildResources(tx, guildId);
  });
  return Response.json({ ok: true, resources });
}
