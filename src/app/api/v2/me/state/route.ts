import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { guilds, outpostOccupations, savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { ensureSoloGuild } from "@/lib/server/v2EnsureSoloGuild";
import { ensureV2StarterSkills } from "@/lib/server/v2Skills";
import { ensureV2Character } from "@/lib/server/v2Character";
import { parseV2SkillsState } from "@/adventure/data/v2/v2Skills";
import { derivePlayerCombatV2 } from "@/lib/server/derivePlayerCombatV2";
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

  // ensureSoloGuild + ensureV2StarterSkills 둘 다 idempotent write — 같은 tx 에서.
  // 후자는 기존 staging 유저가 PR-1 카탈로그 도입 후 첫 me/state 호출 시 자동 백필.
  // 학습 보유 6 종 모두 있고 equipped 비어있지 않으면 noop.
  const guildId = await db.transaction(async (tx) => {
    const gid = await ensureSoloGuild(tx, userId);
    await ensureV2StarterSkills(tx, userId);
    // 신캐/리셋 후 char.v2 row 가 없으면 빈 obj 로 시드 — derive 가 null 반환하지
    // 않게 (V2_BASE_MP 50 + 기본 stats 적용된 캐릭이 첫 me/state 응답부터 보임).
    await ensureV2Character(tx, userId);
    return gid;
  });

  const [charRow, profileRow, guildRow, combat, resources, skillsRow] =
    await Promise.all([
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
    derivePlayerCombatV2(userId),
    db.transaction(async (tx) => readGuildResources(tx, guildId)),
    db
      .select({ value: savesKv.value })
      .from(savesKv)
      .where(and(eq(savesKv.userId, userId), eq(savesKv.key, "skills.v2")))
      .limit(1)
      .then((rows) => rows[0]),
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
  // PR-outpost-info: V2AdventureHome 의 거점 카드용 occupation (보유 길드/세율/정책/다음 공격)
  // 동봉. row 없으면 occupation=null (NPC 운영). 점령 길드 name 별도 select.
  type OccupationInfo = {
    occupiedByUserId: string | null;
    occupiedByGuildId: number | null;
    occupiedByGuildName: string | null;
    occupiedAt: string;
    policy: string;
    taxRate: string;
    nextAttackAt: string;
  };
  type CurrentOutpost = {
    id: string;
    name: string;
    occupation: OccupationInfo | null;
  };
  let currentOutpost: CurrentOutpost | null = null;
  const lastVisitId = charSave.lastVisitedOutpost?.outpostId;
  if (typeof lastVisitId === "string") {
    const o = OUTPOSTS.find((x) => x.id === lastVisitId);
    if (o) {
      const occRow = (
        await db
          .select()
          .from(outpostOccupations)
          .where(eq(outpostOccupations.outpostId, o.id))
          .limit(1)
      )[0];
      let occupation: OccupationInfo | null = null;
      if (occRow) {
        let occGuildName: string | null = null;
        if (occRow.occupiedByGuildId != null) {
          const g = (
            await db
              .select({ name: guilds.name })
              .from(guilds)
              .where(eq(guilds.id, occRow.occupiedByGuildId))
              .limit(1)
          )[0];
          occGuildName = g?.name ?? null;
        }
        occupation = {
          occupiedByUserId: occRow.occupiedByUserId,
          occupiedByGuildId: occRow.occupiedByGuildId,
          occupiedByGuildName: occGuildName,
          occupiedAt: occRow.occupiedAt.toISOString(),
          policy: occRow.policy,
          taxRate: occRow.taxRate,
          nextAttackAt: occRow.nextAttackAt.toISOString(),
        };
      }
      currentOutpost = { id: o.id, name: o.name, occupation };
    }
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
  const maxMp = combat?.player.maxMp ?? 0;

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
      // v2 마법 풀 — derive 가 character.v2.mp 시드, 미지정이면 maxMp 풀충. INT 0 이면 둘 다 0.
      mp: combat?.player.mp ?? maxMp,
      maxMp,
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
    skills: parseV2SkillsState(skillsRow?.value),
  });
}
