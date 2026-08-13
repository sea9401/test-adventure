import { and, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { savesKv } from "@/db/schema";
import type { Avatar } from "@/adventure/profile/avatars";
import { readProfileValue } from "@/adventure/profile/profileValue";
import {
  museunCosmeticAppearance,
  type ProfileBorderId,
} from "@/adventure/data/v2/museunCosmetics";
import {
  parseV2SkillsState,
  type V2SkillsState,
} from "@/adventure/data/v2/v2Skills";
import { V2_CORE_LOOP_V2 } from "@/adventure/data/v2/coreLoopConfig";
import type { PlayerCombat } from "@/adventure/v2/combat/engine";
import { derivePlayerCombatV2 } from "@/lib/server/derivePlayerCombatV2";
import { sanitizeCombatLoadout } from "@/lib/server/v2Skills";
import { readCodexSpBonus } from "@/lib/server/codexSpBonus";
import { readJobUnlockContext } from "@/lib/server/jobUnlockContext";
import { resolveUserDisplayName } from "@/lib/server/serverFeed";
import { isSuperAdminEmail } from "@/lib/server/isAdmin";
import { usersCannotInteract } from "@/lib/server/ugcSafety";
import {
  CHARACTER_STATE_KEY,
  PROFILE_STORAGE_KEY,
} from "@/lib/storage-keys";

export type FriendlySparringTarget = {
  userId: string;
  name: string;
  level: number;
  avatar: Avatar;
  profileBorder: ProfileBorderId | null;
};

export type FriendlySparringCombatant = {
  name: string;
  level: number;
  player: PlayerCombat;
  skills: V2SkillsState;
};

type TargetRow = {
  user_id?: string;
  email?: string | null;
  display_name?: string | null;
  character?: unknown;
  profile?: unknown;
};

type CharacterShape = {
  level?: unknown;
  museunCosmetics?: unknown;
  arenaChampionshipBadges?: unknown;
};

function levelOf(character: unknown): number {
  const value = (character as CharacterShape | null)?.level;
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(1, Math.floor(value))
    : 1;
}

export async function resolveFriendlySparringTarget(
  viewerUserId: string,
  rawName: string,
): Promise<FriendlySparringTarget | null> {
  const name = rawName.trim();
  if (!name) return null;

  const result = await db.execute(sql`
    SELECT
      u.id AS user_id,
      u.email,
      COALESCE(NULLIF(btrim(u.game_name), ''), btrim(p.value->>'name')) AS display_name,
      c.value AS character,
      p.value AS profile
    FROM users u
    LEFT JOIN saves_kv p
      ON p.user_id = u.id AND p.key = ${PROFILE_STORAGE_KEY}
    LEFT JOIN saves_kv c
      ON c.user_id = u.id AND c.key = ${CHARACTER_STATE_KEY}
    WHERE lower(COALESCE(NULLIF(btrim(u.game_name), ''), btrim(p.value->>'name')))
        = lower(${name})
    LIMIT 1
  `);
  const row = result.rows[0] as TargetRow | undefined;
  const targetUserId = row?.user_id;
  if (
    !targetUserId ||
    targetUserId === viewerUserId ||
    !row.character ||
    isSuperAdminEmail(row.email) ||
    (await usersCannotInteract(viewerUserId, targetUserId))
  ) {
    return null;
  }

  const character = row.character as CharacterShape;
  const cosmetics = museunCosmeticAppearance(
    character.museunCosmetics,
    Date.now(),
    character.arenaChampionshipBadges,
  );
  const displayName = row.display_name?.trim();
  if (!displayName) return null;

  return {
    userId: targetUserId,
    name: displayName,
    level: levelOf(character),
    avatar: readProfileValue(row.profile)?.gender ?? "male1",
    profileBorder: cosmetics.profileBorder,
  };
}

export async function prepareFriendlySparringCombatant(
  userId: string,
): Promise<FriendlySparringCombatant | null> {
  const rows = await db
    .select({ key: savesKv.key, value: savesKv.value })
    .from(savesKv)
    .where(
      and(
        sql`${savesKv.userId} = ${userId}`,
        inArray(savesKv.key, [
          CHARACTER_STATE_KEY,
          "equipment.v2",
          "skills.v2",
          "proficiency.v2",
          PROFILE_STORAGE_KEY,
        ]),
      ),
    );
  const byKey = new Map(rows.map((row) => [row.key, row.value]));
  const character = byKey.get(CHARACTER_STATE_KEY);
  if (!character || typeof character !== "object") return null;

  const proficiencyRaw = byKey.get("proficiency.v2");
  let skills = parseV2SkillsState(byKey.get("skills.v2"));
  if (V2_CORE_LOOP_V2) {
    skills = sanitizeCombatLoadout(
      skills,
      character,
      proficiencyRaw,
      (await readCodexSpBonus(db, userId)).total,
      await readJobUnlockContext(db, userId),
    );
  }

  const derived = await derivePlayerCombatV2(userId, db, {
    character,
    equipmentSave: byKey.get("equipment.v2"),
    skillsRaw: skills,
    proficiencyRaw,
    includeCookingBuff: false,
  });
  if (!derived) return null;

  return {
    name: await resolveUserDisplayName(userId),
    level: levelOf(character),
    player: {
      ...derived.player,
      hp: derived.maxHp,
      mp: derived.player.maxMp ?? 0,
    },
    skills,
  };
}
