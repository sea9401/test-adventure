import { sql } from "drizzle-orm";
import { db } from "@/db";
import {
  HOUSING_SAVE_KEY,
  parseHousingState,
} from "@/adventure/data/v2/housing";
import { FISHING_CODEX_KEY } from "@/adventure/v2/fishingCodex";
import { PROFILE_STORAGE_KEY } from "@/lib/storage-keys";
import { ensureUser } from "@/lib/server/ensureUser";
import {
  housingContextFromSaves,
  publicHousingOptions,
  sanitizePublicHousingState,
} from "@/lib/server/housing";
import { readSave } from "@/lib/server/savesKv";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import { LIFE_WORKSHOP_SAVE_KEY } from "@/adventure/v2/lifeWorkshop";

type Ctx = { params: Promise<{ name: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const viewerId = await ensureUser();
  if (!viewerId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const limited = enforceUserAndIpRateLimit(req, {
    userId: viewerId,
    action: "v2:housing:public-read",
    userLimit: 90,
    ipLimit: 500,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const { name: rawName } = await ctx.params;
  const lookupName = (rawName ?? "").trim();
  if (!lookupName) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const resolved = await db.execute(sql`
    SELECT
      u.id AS user_id,
      COALESCE(NULLIF(btrim(u.game_name), ''), btrim(p.value->>'name')) AS display_name
    FROM users u
    LEFT JOIN saves_kv p
      ON p.user_id = u.id AND p.key = ${PROFILE_STORAGE_KEY}
    WHERE lower(COALESCE(NULLIF(btrim(u.game_name), ''), btrim(p.value->>'name')))
        = lower(${lookupName})
    LIMIT 1
  `);
  const target = resolved.rows[0] as
    | { user_id?: string; display_name?: string }
    | undefined;
  if (!target?.user_id) {
    return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const [housingRaw, equipmentRaw, adventureLogRaw, fishingCodexRaw, lifeWorkshopRaw] =
    await Promise.all([
      readSave(db, target.user_id, HOUSING_SAVE_KEY, null),
      readSave(db, target.user_id, "equipment.v2", {}),
      readSave(db, target.user_id, "adventure-log.v2", {}),
      readSave(db, target.user_id, FISHING_CODEX_KEY, {}),
      readSave(db, target.user_id, LIFE_WORKSHOP_SAVE_KEY, {}),
    ]);
  const room = parseHousingState(housingRaw);
  if (!room.isPublic && target.user_id !== viewerId) {
    return Response.json({ ok: false, error: "private_room" }, { status: 403 });
  }
  const context = housingContextFromSaves({
    equipmentRaw,
    adventureLogRaw,
    fishingCodexRaw,
    lifeWorkshopRaw,
  });
  const displayOptions = publicHousingOptions(room, context.displayOptions);

  return Response.json({
    ok: true,
    ownerName: target.display_name?.trim() || lookupName,
    room: sanitizePublicHousingState(room, displayOptions),
    displayOptions,
  });
}
