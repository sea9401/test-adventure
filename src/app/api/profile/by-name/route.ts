import { sql } from "drizzle-orm";
import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { gradeForFame } from "@/adventure/data/guildGrades";

// GET /api/profile/by-name?name=Hero
// 인증된 유저가 다른 모험가의 공개 프로필을 조회. 단일 EC2 / DB 라
// 닉네임 lookup → 한 번에 character.v2 + adventure-log.v2 + guild 조인.
// 노출 범위: 이름/레벨/클래스/칭호/명성/전투 횟수/길드/장착 장비/보유 칭호/장착 스킬·특기.
// 비공개: 인벤토리·재화·스탯 수치·골드·HP 등.
export async function GET(req: Request) {
  const me = await ensureUser();
  if (!me) return new Response("unauthorized", { status: 401 });

  const url = new URL(req.url);
  const raw = url.searchParams.get("name") ?? "";
  const name = raw.trim();
  if (!name) return new Response("name required", { status: 400 });

  // users.game_name 우선, 없으면 character-profile.v2 의 name fallback (case-insensitive).
  const result = await db.execute(sql`
    WITH target AS (
      SELECT
        u.id AS user_id,
        COALESCE(u.game_name, p.value->>'name') AS name
      FROM users u
      LEFT JOIN saves_kv p ON p.user_id = u.id AND p.key = 'character-profile.v2'
      WHERE lower(COALESCE(u.game_name, p.value->>'name')) = lower(${name})
      LIMIT 1
    )
    SELECT
      t.user_id,
      t.name,
      c.value AS character,
      l.value AS adventure_log,
      g.id AS guild_id,
      g.name AS guild_name,
      g.fame_total AS guild_fame_total
    FROM target t
    LEFT JOIN saves_kv c ON c.user_id = t.user_id AND c.key = 'character.v2'
    LEFT JOIN saves_kv l ON l.user_id = t.user_id AND l.key = 'adventure-log.v2'
    LEFT JOIN guild_members gm ON gm.user_id = t.user_id
    LEFT JOIN guilds g ON g.id = gm.guild_id AND g.disbanded_at IS NULL
    LIMIT 1
  `);

  if (result.rows.length === 0) {
    return new Response("not found", { status: 404 });
  }

  type Row = {
    user_id: string;
    name: string;
    character: unknown;
    adventure_log: unknown;
    guild_id: number | null;
    guild_name: string | null;
    guild_fame_total: number | null;
  };
  const row = result.rows[0] as unknown as Row;

  const ch = (row.character ?? {}) as Record<string, unknown>;
  const log = (row.adventure_log ?? {}) as Record<string, unknown>;

  const equipped =
    (ch.equipped as Record<string, { id?: string } | null> | undefined) ?? {};
  const itemIdOf = (slot: { id?: string } | null | undefined): string | null =>
    slot && typeof slot.id === "string" ? slot.id : null;

  // 장착 스킬/특기 — character.v2 의 equippedSkills (array) / equippedFeats (array | null) 저장 형태.
  const equippedSkills = Array.isArray(ch.equippedSkills)
    ? (ch.equippedSkills as unknown[]).filter(
        (s): s is string => typeof s === "string",
      )
    : [];
  const equippedFeats = Array.isArray(ch.equippedFeats)
    ? (ch.equippedFeats as unknown[]).filter(
        (s): s is string => typeof s === "string",
      )
    : [];

  const titlesObj = (log.titles ?? {}) as Record<string, unknown>;
  const obtainedTitles = Object.keys(titlesObj);

  const guild =
    row.guild_id !== null && row.guild_name && row.guild_fame_total !== null
      ? {
          name: row.guild_name,
          grade: gradeForFame(row.guild_fame_total),
        }
      : null;

  return Response.json({
    name: row.name,
    isSelf: row.user_id === me,
    level: typeof ch.level === "number" ? ch.level : 1,
    className: typeof ch.className === "string" ? ch.className : "",
    titleName: typeof ch.titleName === "string" ? ch.titleName : null,
    fame: typeof ch.fame === "number" ? ch.fame : 0,
    battleCount: typeof ch.battleCount === "number" ? ch.battleCount : 0,
    guild,
    equipped: {
      weapon: itemIdOf(equipped.weapon),
      armor: itemIdOf(equipped.armor),
      accessory: itemIdOf(equipped.accessory),
    },
    obtainedTitles,
    activeSkills: equippedSkills,
    activeFeats: equippedFeats,
  });
}
