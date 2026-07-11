import { inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { presence, users } from "@/db/schema";
import { requireAdmin } from "@/lib/server/isAdmin";

const MAX_USERS = 200;

// 관리자 표에서 내부 UUID 대신 닉네임을 표시하기 위한 일괄 조회.
// 원본 userId는 링크와 정확한 식별에 계속 사용하고 화면 라벨만 사람이 읽기 좋게 바꾼다.
export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (gate) return gate;

  const body = (await req.json().catch(() => null)) as { userIds?: unknown } | null;
  const userIds = Array.isArray(body?.userIds)
    ? [...new Set(body.userIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0).map((id) => id.trim()))].slice(0, MAX_USERS)
    : [];

  if (userIds.length === 0) return Response.json({ ok: true, users: [] });

  const rows = await db
    .select({
      id: users.id,
      gameName: sql<string | null>`coalesce(${users.gameName}, ${presence.name})`,
      email: users.email,
    })
    .from(users)
    .leftJoin(presence, sql`${presence.userId} = ${users.id}`)
    .where(inArray(users.id, userIds));

  return Response.json({ ok: true, users: rows });
}
