import { desc, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { users, presence } from "@/db/schema";
import { requireAdmin } from "@/lib/server/isAdmin";

// GET /api/admin/users?q=<search>
// q 비어있으면 최근 활동 순 50명. q 있으면 email / 인게임 닉네임 부분 일치.
// presence 는 LEFT JOIN — 한 번도 접속 안 한 유저도 검색됨.
// gameName: users.game_name(권위적 닉네임) 우선, 미설정이면 presence 스냅샷으로 폴백.
export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (gate) return gate;

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();

  const base = db
    .select({
      id: users.id,
      email: users.email,
      gameName: sql<string | null>`coalesce(${users.gameName}, ${presence.name})`,
      className: presence.className,
      lastSeenAt: presence.lastSeenAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .leftJoin(presence, sql`${presence.userId} = ${users.id}`);

  const rows = await (q
    ? base.where(
        or(
          ilike(users.email, `%${q}%`),
          ilike(users.id, `%${q}%`),
          ilike(users.gameName, `%${q}%`),
          ilike(presence.name, `%${q}%`),
        ),
      )
    : base
  )
    .orderBy(desc(presence.lastSeenAt), desc(users.createdAt))
    .limit(50);

  // 타임스탬프는 명시적으로 ISO 문자열화 — AdminUserRow(string) 계약과 일치시키고,
  // Date 직렬화가 환경별로 달라질 여지 차단(guilds/me·admin/stats 와 동일 패턴).
  return Response.json(
    rows.map((r) => ({
      ...r,
      lastSeenAt:
        r.lastSeenAt instanceof Date
          ? r.lastSeenAt.toISOString()
          : (r.lastSeenAt ?? null),
      createdAt:
        r.createdAt instanceof Date
          ? r.createdAt.toISOString()
          : String(r.createdAt),
    })),
  );
}
