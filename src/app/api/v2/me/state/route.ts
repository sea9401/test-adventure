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
import { OUTPOSTS } from "@/adventure/data/v2/outposts";

// GET /api/v2/me/state — V2GameFlow 의 mount fetch (캐릭+자원+currentOutpost).
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
    lastVisitedOutpost?: { outpostId?: string; at?: number };
  };

  // V2TopBar 좌측 표시 — character.v2.lastVisitedOutpost.outpostId → OUTPOSTS lookup.
  // null = 아직 거점 방문 안 함 ("이동 중").
  let currentOutpost: { id: string; name: string } | null = null;
  const lastVisitId = charSave.lastVisitedOutpost?.outpostId;
  if (typeof lastVisitId === "string") {
    const o = OUTPOSTS.find((x) => x.id === lastVisitId);
    if (o) currentOutpost = { id: o.id, name: o.name };
  }
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

  // V2CharacterScreen 의 StatsPanel 표시용. combat 미생성(캐릭 없음) 시 null.
  const stats = combat
    ? {
        base: combat.baseAllocatedStats,
        total: combat.totalStats,
      }
    : null;
  const combatStats = combat
    ? { atk: combat.player.atk, def: combat.player.def, spd: combat.player.spd }
    : null;

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
    stats,
    combat: combatStats,
    guild: { id: guildId, name: guildName },
    resources,
    currentOutpost,
  });
}
