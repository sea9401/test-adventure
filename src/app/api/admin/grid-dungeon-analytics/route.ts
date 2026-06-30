import { sql } from "drizzle-orm";
import { db } from "@/db";
import {
  GRID_DUNGEON_HISTORY_KEY,
  parseGridDungeonHistory,
} from "@/adventure/data/v2/gridDungeon";
import { getAdminEmailsList, requireAdmin } from "@/lib/server/isAdmin";
import { aggregateGridDungeonAnalytics } from "./aggregate";

function parseDays(raw: string | null): number | null {
  if (raw === "all") return null;
  const days = Math.floor(Number(raw ?? 30));
  if (!Number.isFinite(days) || days <= 0) return 30;
  return Math.min(days, 365);
}

export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (gate) return gate;

  const url = new URL(req.url);
  const days = parseDays(url.searchParams.get("days"));
  const query = (url.searchParams.get("q") ?? "").trim();
  const sinceAt = days == null ? undefined : Date.now() - days * 24 * 60 * 60 * 1000;
  const adminSet = new Set(getAdminEmailsList().map((e) => e.toLowerCase()));
  const result = await db.execute(sql`
    SELECT
      u.id AS user_id,
      LOWER(u.email) AS email,
      COALESCE(
        NULLIF(p.value ->> 'name', ''),
        NULLIF(u.game_name, ''),
        NULLIF(u.name, ''),
        '모험가'
      ) AS name,
      h.value AS history
    FROM saves_kv h
    JOIN users u ON u.id = h.user_id
    LEFT JOIN saves_kv p
      ON p.user_id = u.id AND p.key = 'character-profile.v2'
    WHERE h.key = ${GRID_DUNGEON_HISTORY_KEY}
  `);

  type Row = {
    user_id: string;
    email: string | null;
    name: string | null;
    history: unknown;
  };

  let adminExcluded = 0;
  const users = [];
  for (const row of result.rows as unknown as Row[]) {
    if (row.email && adminSet.has(row.email)) {
      adminExcluded += 1;
      continue;
    }
    users.push({
      userId: row.user_id,
      name: row.name?.trim() || "모험가",
      history: parseGridDungeonHistory(row.history),
    });
  }

  return Response.json(
    aggregateGridDungeonAnalytics(users, {
      adminExcluded,
    }, {
      sinceAt,
      query,
    }),
  );
}
