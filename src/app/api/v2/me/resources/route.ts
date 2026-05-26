import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { ensureSoloGuild } from "@/lib/server/v2EnsureSoloGuild";
import { readGuildResources } from "@/lib/server/v2GuildResources";

// GET /api/v2/me/resources — viewer 의 길드 공용 자원 풀 조회.
// 라이브 PR-vi-b 부터 길드 자원으로 통일. 1인 길드 가정 하 옛 user-level
// v2-resources 와 동치이지만 다인 길드는 공유.
// 응답: { resources: { stone, scrolls, activeScrollExpiresAt } } — PR-7b 후 soldiers 제거.

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const resources = await db.transaction(async (tx) => {
    const guildId = await ensureSoloGuild(tx, userId);
    return readGuildResources(tx, guildId);
  });
  return Response.json({ ok: true, resources });
}
