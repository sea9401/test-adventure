import { sql } from "drizzle-orm";
import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { gradeForFame } from "@/adventure/data/guildGrades";

const LIST_LIMIT = 100;
// 메모리 캐시 TTL — 길드 명성/멤버수는 매우 빨리 변하지 않으니 30초 staleness OK.
// 캐시는 길드 전체 정렬 결과만 보관, 본인 길드 매칭은 매 요청마다 (요청 유저별 가변).
const CACHE_TTL_MS = 30_000;

type GuildRow = {
  guildId: number;
  name: string;
  fameTotal: number;
  memberCount: number;
  rank: number;
};

let cachedRows: GuildRow[] | null = null;
let cachedAt = 0;
let inFlight: Promise<GuildRow[]> | null = null;

async function fetchRows(): Promise<GuildRow[]> {
  const result = await db.execute(sql`
    WITH stats AS (
      SELECT
        g.id AS guild_id,
        g.name AS name,
        g.fame_total AS fame_total,
        g.created_at AS created_at,
        (
          SELECT COUNT(*)::int
          FROM guild_members gm
          WHERE gm.guild_id = g.id
        ) AS member_count
      FROM guilds g
      WHERE g.disbanded_at IS NULL
    ),
    ranked AS (
      SELECT *,
        ROW_NUMBER() OVER (ORDER BY fame_total DESC, created_at ASC)::int AS rank
      FROM stats
    )
    SELECT guild_id, name, fame_total, member_count, rank
    FROM ranked
    ORDER BY rank
  `);

  type DbRow = {
    guild_id: number;
    name: string;
    fame_total: number;
    member_count: number;
    rank: number;
  };
  return (result.rows as unknown as DbRow[]).map((r) => ({
    guildId: Number(r.guild_id),
    name: String(r.name),
    fameTotal: Number(r.fame_total),
    memberCount: Number(r.member_count),
    rank: Number(r.rank),
  }));
}

async function getRows(): Promise<GuildRow[]> {
  const now = Date.now();
  if (cachedRows && now - cachedAt < CACHE_TTL_MS) return cachedRows;
  if (inFlight) return inFlight;
  inFlight = fetchRows().then(
    (rows) => {
      cachedRows = rows;
      cachedAt = Date.now();
      inFlight = null;
      return rows;
    },
    (err: unknown) => {
      inFlight = null;
      throw err;
    },
  );
  return inFlight;
}

// GET /api/rankings/guilds — 활성 길드를 누적 명성(fameTotal) 내림차순으로 정렬.
// 동률은 createdAt 오래된 순. 응답에는 등급/멤버 수도 포함.
// 정렬 결과는 30초 메모리 캐시 — 본인 길드 매칭만 매 요청 (요청 유저별 가변).
export async function GET() {
  const userId = await ensureUser();
  if (!userId) return new Response("unauthorized", { status: 401 });

  const rows = await getRows();

  // 본인 길드 — 1회 쿼리로 결정. 가입 안 했거나 해체된 길드면 null.
  const myMembership = await db.execute(sql`
    SELECT gm.guild_id
    FROM guild_members gm
    JOIN guilds g ON g.id = gm.guild_id
    WHERE gm.user_id = ${userId} AND g.disbanded_at IS NULL
    LIMIT 1
  `);
  const myGuildId =
    myMembership.rows.length > 0
      ? Number((myMembership.rows[0] as { guild_id: number }).guild_id)
      : null;

  const list = rows.slice(0, LIST_LIMIT).map((r) => ({
    rank: r.rank,
    name: r.name,
    fameTotal: r.fameTotal,
    memberCount: r.memberCount,
    grade: gradeForFame(r.fameTotal),
    mine: r.guildId === myGuildId,
  }));

  const myRow =
    myGuildId !== null ? rows.find((r) => r.guildId === myGuildId) : undefined;
  const me = myRow
    ? {
        rank: myRow.rank,
        name: myRow.name,
        fameTotal: myRow.fameTotal,
        memberCount: myRow.memberCount,
        grade: gradeForFame(myRow.fameTotal),
      }
    : null;

  return Response.json({ list, me });
}
