import { and, desc, eq, ilike, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { guildJoinRequests, guildMembers, guilds } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { gradeForFame } from "@/adventure/data/guildQuests";
import { GUILD_MAX_MEMBERS, guildMemberCap } from "@/adventure/data/guild";

const BROWSE_LIMIT = 30;

// GET /api/guilds/browse?q= — 가입할 길드 둘러보기.
// 활성 길드 목록(명성순) + 내 pending 신청 길드 id. q 가 있으면 이름 substring 검색.
export async function GET(req: Request) {
  const userId = await ensureUser();
  if (!userId) return new Response("unauthorized", { status: 401 });

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();

  const rows = await db
    .select({
      id: guilds.id,
      name: guilds.name,
      description: guilds.description,
      fameTotal: guilds.fameTotal,
      acceptingRequests: guilds.acceptingRequests,
      nationName: guilds.nationName,
      memberCount: sql<number>`(
        SELECT count(*)::int FROM ${guildMembers}
        WHERE ${guildMembers.guildId} = ${guilds.id}
      )`,
    })
    .from(guilds)
    .where(
      and(
        isNull(guilds.disbandedAt),
        q.length > 0 ? ilike(guilds.name, `%${q}%`) : undefined,
      ),
    )
    .orderBy(desc(guilds.fameTotal), guilds.id)
    .limit(BROWSE_LIMIT);

  const myPending = await db
    .select({ id: guildJoinRequests.id, guildId: guildJoinRequests.guildId })
    .from(guildJoinRequests)
    .where(
      and(
        eq(guildJoinRequests.userId, userId),
        eq(guildJoinRequests.status, "pending"),
      ),
    )
    .limit(1);

  return Response.json({
    // 기본 정원(국가 미선포). 길드별 한도는 각 항목 maxMembers 참조(국가=상향).
    maxMembers: GUILD_MAX_MEMBERS,
    myPendingRequest: myPending[0]
      ? { requestId: myPending[0].id, guildId: myPending[0].guildId }
      : null,
    guilds: rows.map((g) => ({
      id: g.id,
      name: g.name,
      description: g.description ?? null,
      fameTotal: g.fameTotal,
      grade: gradeForFame(g.fameTotal),
      memberCount: Number(g.memberCount ?? 0),
      acceptingRequests: g.acceptingRequests,
      nationName: g.nationName ?? null,
      maxMembers: guildMemberCap(g.nationName != null),
    })),
  });
}
