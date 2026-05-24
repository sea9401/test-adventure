import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { fiefdoms, guildMembers, guilds } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import type { FiefdomState } from "@/adventure/fiefdom/types";

// GET /api/fiefdom/browse — 다른 길드 영지 10개 랜덤 샘플.
// 자기 길드 제외, 해체된 길드 제외. 별자리 맵 노드로 표시.
// 응답: { targets: Array<{ guildId, guildName, lodgeRank, armySize, heroLevel, shieldUntil }> }.
const SAMPLE_SIZE = 10;

export async function GET() {
  const userId = await ensureUser();
  if (!userId) return new Response("unauthorized", { status: 401 });

  const membership = await db
    .select({ guildId: guildMembers.guildId })
    .from(guildMembers)
    .where(eq(guildMembers.userId, userId))
    .limit(1);
  if (!membership[0]) {
    return Response.json({ error: "no_guild" }, { status: 403 });
  }
  const myGuildId = membership[0].guildId;

  // random() LIMIT 10 — 길드 수 천 단위까진 큰 부담 없음. 그 위로는 별도 샘플링 전략 필요.
  const rows = await db
    .select({
      guildId: fiefdoms.guildId,
      guildName: guilds.name,
      lodgeRank: guilds.lodgeRank,
      state: fiefdoms.state,
      shieldUntil: fiefdoms.shieldUntil,
    })
    .from(fiefdoms)
    .innerJoin(guilds, eq(guilds.id, fiefdoms.guildId))
    .where(and(ne(fiefdoms.guildId, myGuildId), isNull(guilds.disbandedAt)))
    .orderBy(sql`random()`)
    .limit(SAMPLE_SIZE);

  const targets = rows.map((r) => {
    const s = r.state as FiefdomState;
    const armySize = (s.units?.warrior ?? 0) + (s.units?.archer ?? 0);
    const heroLevel = s.hero?.level ?? 1;
    return {
      guildId: r.guildId,
      guildName: r.guildName,
      lodgeRank: r.lodgeRank,
      armySize,
      heroLevel,
      shieldUntil: r.shieldUntil?.toISOString() ?? null,
    };
  });

  return Response.json({ targets });
}
