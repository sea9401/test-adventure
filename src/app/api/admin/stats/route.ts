import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requireAdmin } from "@/lib/server/isAdmin";

export type AdminStatsRow = {
  userId: string;
  email: string | null;
  name: string | null;
  createdAt: string;
  lastSeenAt: string | null;
  level: number | null;
  exp: number | null;
  gold: number | null;
  fame: number | null;
  battleCount: number;
};

// GET /api/admin/stats
// 모든 유저의 진척 한 번에. character.v2 의 level/exp/gold/fame + adventure-log.v2
// 의 monsters.{*}.kills 합 + battleLosses 로 battleCount derive.
// 캐릭터 미생성 유저도 포함 (level NULL) — 가입만 하고 안 들어온 케이스 식별용.
export async function GET() {
  const gate = await requireAdmin();
  if (gate) return gate;

  const result = await db.execute(sql`
    SELECT
      u.id AS user_id,
      u.email,
      u.created_at AS created_at,
      p.name AS name,
      p.last_seen_at AS last_seen_at,
      (c.value->>'level')::int AS level,
      -- exp/gold/fame 는 누적값이라 int4 범위(~21억)를 넘을 수 있다(예: gold 1000억+).
      -- int 캐스팅은 "integer out of range" 로 쿼리 전체를 500 시키므로 bigint 로 받는다.
      (c.value->>'exp')::bigint AS exp,
      (c.value->>'gold')::bigint AS gold,
      (c.value->>'fame')::bigint AS fame,
      (
        COALESCE((
          SELECT SUM((m.value->>'kills')::bigint)
          FROM jsonb_each(l.value->'monsters') AS m
          WHERE (m.value->>'kills') IS NOT NULL
        ), 0)
        + COALESCE((l.value->>'battleLosses')::bigint, 0)
      ) AS battle_count
    FROM users u
    LEFT JOIN presence p ON p.user_id = u.id
    LEFT JOIN saves_kv c ON c.user_id = u.id AND c.key = 'character.v2'
    LEFT JOIN saves_kv l ON l.user_id = u.id AND l.key = 'adventure-log.v2'
    ORDER BY u.created_at DESC
    LIMIT 500
  `);

  // drizzle-orm execute 는 { rows: ... } 반환. 컬럼 snake_case → camelCase.
  const rows = (result.rows as Record<string, unknown>[]).map((r) => ({
    userId: String(r.user_id),
    email: r.email == null ? null : String(r.email),
    name: r.name == null ? null : String(r.name),
    createdAt:
      r.created_at instanceof Date
        ? r.created_at.toISOString()
        : String(r.created_at),
    lastSeenAt:
      r.last_seen_at instanceof Date
        ? r.last_seen_at.toISOString()
        : r.last_seen_at == null
          ? null
          : String(r.last_seen_at),
    level: r.level == null ? null : Number(r.level),
    exp: r.exp == null ? null : Number(r.exp),
    gold: r.gold == null ? null : Number(r.gold),
    fame: r.fame == null ? null : Number(r.fame),
    battleCount: Number(r.battle_count ?? 0),
  })) satisfies AdminStatsRow[];

  return Response.json(rows);
}
