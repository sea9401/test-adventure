import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { guilds, savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { ensureSoloGuild } from "@/lib/server/v2EnsureSoloGuild";
import { derivePlayerCombatFromSaves } from "@/lib/server/derivePlayerCombatFromSaves";
import { readGuildResources } from "@/lib/server/v2GuildResources";
import { requiredExpToNext } from "@/lib/leveling";
import {
  MAX_STAMINA,
  applyRegen,
  parseStaminaFromSave,
} from "@/adventure/v2/stamina";
import { applyHpRegen, parseHpRegenSince } from "@/adventure/v2/hpRegen";

// GET /api/v2/me/state — V2HomeScreen 의 단일 fetch.
//
// 캐릭터(레벨/EXP/HP/스태미너/골드) + 길드(id/name) + 자원풀 한 번에.
// HP·stamina 는 시간 회복 적용한 현재값으로 surface (다음 사냥 진입 시 동기화).

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // ensureSoloGuild 는 idempotent write 가능 → tx 안. 나머지는 read-only 라 분리.
  const guildId = await db.transaction(async (tx) =>
    ensureSoloGuild(tx, userId),
  );

  const [charRow, profileRow, guildRow, combat, resources] = await Promise.all([
    db
      .select({ value: savesKv.value })
      .from(savesKv)
      .where(and(eq(savesKv.userId, userId), eq(savesKv.key, "character.v2")))
      .limit(1)
      .then((rows) => rows[0]),
    db
      .select({ value: savesKv.value })
      .from(savesKv)
      .where(
        and(
          eq(savesKv.userId, userId),
          eq(savesKv.key, "character-profile.v2"),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]),
    db
      .select({ name: guilds.name })
      .from(guilds)
      .where(eq(guilds.id, guildId))
      .limit(1)
      .then((rows) => rows[0]),
    derivePlayerCombatFromSaves(userId),
    db.transaction(async (tx) => readGuildResources(tx, guildId)),
  ]);

  const charSave = (charRow?.value ?? {}) as {
    level?: number;
    exp?: number;
    hp?: number;
    hpRegenSince?: number;
    stamina?: unknown;
    gold?: number;
  };
  const profile = (profileRow?.value ?? null) as {
    name?: string;
    gender?: string;
  } | null;
  const name = profile?.name?.trim() || "모험가";
  const gender =
    typeof profile?.gender === "string" && profile.gender.length > 0
      ? profile.gender
      : "male1";
  const guildName = guildRow?.name ?? "—";
  const maxHp = combat?.maxHp ?? 100;

  const now = Date.now();
  const stamina = applyRegen(parseStaminaFromSave(charSave.stamina, now), now);

  const hpStored = Math.max(0, charSave.hp ?? maxHp);
  const hpRegenSince = parseHpRegenSince(charSave.hpRegenSince, now);
  const hpRegen = applyHpRegen(hpStored, maxHp, hpRegenSince, now);

  const level = Math.max(1, charSave.level ?? 1);
  const exp = Math.max(0, charSave.exp ?? 0);
  const expToNext = requiredExpToNext(level);

  return Response.json({
    ok: true,
    character: {
      name,
      gender,
      level,
      exp,
      expToNext,
      hp: hpRegen.hp,
      maxHp,
      stamina: {
        current: stamina.current,
        max: MAX_STAMINA,
        lastUpdatedAt: stamina.lastUpdatedAt,
      },
      gold: Math.max(0, charSave.gold ?? 0),
    },
    guild: { id: guildId, name: guildName },
    resources,
  });
}
