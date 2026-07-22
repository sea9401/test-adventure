import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  marketplaceInbox,
  pvpRatings,
  pvpSeasons,
  pvpTournaments,
  savesKv,
} from "@/db/schema";
import {
  ARENA_LOADOUTS_KEY,
  CHARACTER_STATE_KEY,
} from "@/lib/storage-keys";
import {
  loadoutEquipmentForApply,
  loadoutSkillsForApply,
  parseActiveArenaLoadout,
  type ArenaLoadout,
} from "@/adventure/data/v2/arenaLoadout";
import {
  parseEquipmentSave,
  type EquipmentSave,
} from "@/adventure/data/v2/v2Equipment";
import {
  parseV2SkillsState,
  type V2SkillsState,
} from "@/adventure/data/v2/v2Skills";
import { V2_CORE_LOOP_V2 } from "@/adventure/data/v2/coreLoopConfig";
import { sanitizeCombatLoadout } from "@/lib/server/v2Skills";
import { readCodexSpBonus } from "@/lib/server/codexSpBonus";
import { readJobUnlockContext } from "@/lib/server/jobUnlockContext";
import {
  derivePlayerCombatV2,
  type DerivedPlayerCombatV2,
  type SavedCharacterV2,
} from "@/lib/server/derivePlayerCombatV2";
import { resolveBattlePvP } from "@/adventure/v2/combat/engine-pvp";
import { autoDuelContext } from "@/adventure/v2/combat/duelOptions";
import { ARENA_DAMAGE_MULTIPLIER } from "@/lib/server/arena";
import { inboxValues } from "@/lib/server/inboxPayload";
import { getOrCreateCurrentSeason } from "./season";
import {
  ARENA_TOURNAMENT_MIN_MATCHES,
  arenaRankedEndsAt,
  arenaSeasonPhase,
  resolveArenaTournament,
  type ArenaSeasonPhase,
  type ArenaTournamentBracket,
  type ArenaTournamentEntrant,
} from "./arenaTournament";

const PROFILE_KEY = "character-profile.v2";
const TOURNAMENT_SAVE_KEYS = [
  CHARACTER_STATE_KEY,
  "equipment.v2",
  "skills.v2",
  "proficiency.v2",
  ARENA_LOADOUTS_KEY,
  PROFILE_KEY,
] as const;

type TournamentCombatPayload = {
  combat: DerivedPlayerCombatV2;
  skills: V2SkillsState;
};

type TournamentRow = typeof pvpTournaments.$inferSelect;

export type ArenaTournamentEnsureResult =
  | {
      kind: "ok";
      seasonId: string;
      created: boolean;
      bracket: ArenaTournamentBracket;
    }
  | {
      kind: "not_open";
      seasonId: string;
      phase: ArenaSeasonPhase;
      rankedEndsAt: Date;
      endAt: Date;
    };

function equipmentSaveForArena(
  equipmentRaw: unknown,
  loadout: ArenaLoadout | null,
): unknown {
  if (!loadout) return equipmentRaw;
  const { owned } = parseEquipmentSave(equipmentRaw);
  const ownedIids = new Set(owned.map((item) => item.iid));
  return {
    owned,
    equipped: loadoutEquipmentForApply(loadout, ownedIids),
  };
}

function skillsStateForArena(
  skillsRaw: unknown,
  loadout: ArenaLoadout | null,
): V2SkillsState {
  const skills = parseV2SkillsState(skillsRaw);
  if (!loadout) return skills;
  return {
    ...skills,
    equipped: loadoutSkillsForApply(loadout, skills.learned),
    pattern: loadout.pattern ?? undefined,
  };
}

function profileName(value: unknown): string {
  const raw = (value ?? {}) as { name?: unknown };
  return typeof raw.name === "string" && raw.name.trim().length > 0
    ? raw.name.trim()
    : "모험가";
}

function characterLevel(value: unknown): number {
  const raw = (value ?? {}) as { level?: unknown };
  return typeof raw.level === "number" && Number.isFinite(raw.level)
    ? Math.max(1, Math.floor(raw.level))
    : 1;
}

function bracketFromRow(row: TournamentRow): ArenaTournamentBracket {
  return row.bracket as ArenaTournamentBracket;
}

async function buildCombatEntrants(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  ranked: Array<{
    userId: string;
    rating: number;
    wins: number;
    losses: number;
    draws: number;
  }>,
): Promise<ArenaTournamentEntrant<TournamentCombatPayload>[]> {
  const userIds = ranked.map((row) => row.userId);
  if (userIds.length === 0) return [];
  const saveRows = await tx
    .select({ userId: savesKv.userId, key: savesKv.key, value: savesKv.value })
    .from(savesKv)
    .where(
      and(
        inArray(savesKv.userId, userIds),
        inArray(savesKv.key, [...TOURNAMENT_SAVE_KEYS]),
      ),
    );
  const savesByUser = new Map<string, Map<string, unknown>>();
  for (const row of saveRows) {
    const saves = savesByUser.get(row.userId) ?? new Map<string, unknown>();
    saves.set(row.key, row.value);
    savesByUser.set(row.userId, saves);
  }

  const entrants: ArenaTournamentEntrant<TournamentCombatPayload>[] = [];
  for (let index = 0; index < ranked.length && entrants.length < 32; index += 1) {
    const rating = ranked[index]!;
    const saves = savesByUser.get(rating.userId);
    const character = saves?.get(CHARACTER_STATE_KEY) as
      | SavedCharacterV2
      | undefined;
    if (!character || character.level == null) continue;
    const loadout = parseActiveArenaLoadout(saves?.get(ARENA_LOADOUTS_KEY));
    const equipmentRaw = saves?.get("equipment.v2") as EquipmentSave | undefined;
    const proficiencyRaw = saves?.get("proficiency.v2");
    let skills = skillsStateForArena(saves?.get("skills.v2"), loadout);
    if (V2_CORE_LOOP_V2) {
      skills = sanitizeCombatLoadout(
        skills,
        character,
        proficiencyRaw,
        (await readCodexSpBonus(tx, rating.userId)).total,
        await readJobUnlockContext(tx, rating.userId),
      );
    }
    const combat = await derivePlayerCombatV2(rating.userId, tx, {
      character,
      equipmentSave: equipmentSaveForArena(equipmentRaw, loadout),
      proficiencyRaw,
      skillsRaw: skills,
    });
    if (!combat) continue;
    entrants.push({
      participant: {
        userId: rating.userId,
        name: profileName(saves?.get(PROFILE_KEY)),
        level: characterLevel(character),
        qualifyingRank: index + 1,
        rating: rating.rating,
        matches: rating.wins + rating.losses + rating.draws,
      },
      payload: { combat, skills },
    });
  }
  return entrants;
}

export async function ensureArenaTournament(
  now: Date = new Date(),
): Promise<ArenaTournamentEnsureResult> {
  const season = await getOrCreateCurrentSeason(now);
  const phase = arenaSeasonPhase(season.endAt, now);
  if (phase !== "tournament") {
    return {
      kind: "not_open",
      seasonId: season.id,
      phase,
      rankedEndsAt: arenaRankedEndsAt(season.endAt),
      endAt: season.endAt,
    };
  }

  return db.transaction(async (tx) => {
    await tx
      .select({ id: pvpSeasons.id })
      .from(pvpSeasons)
      .where(eq(pvpSeasons.id, season.id))
      .for("update");
    const existing = await tx
      .select()
      .from(pvpTournaments)
      .where(eq(pvpTournaments.seasonId, season.id))
      .limit(1)
      .then((rows) => rows[0]);
    if (existing) {
      return {
        kind: "ok" as const,
        seasonId: season.id,
        created: false,
        bracket: bracketFromRow(existing),
      };
    }

    const ranked = await tx
      .select({
        userId: pvpRatings.userId,
        rating: pvpRatings.rating,
        wins: pvpRatings.wins,
        losses: pvpRatings.losses,
        draws: pvpRatings.draws,
      })
      .from(pvpRatings)
      .where(
        and(
          eq(pvpRatings.seasonId, season.id),
          gte(
            sql`${pvpRatings.wins} + ${pvpRatings.losses} + ${pvpRatings.draws}`,
            ARENA_TOURNAMENT_MIN_MATCHES,
          ),
        ),
      )
      .orderBy(
        desc(pvpRatings.rating),
        desc(pvpRatings.wins),
        asc(pvpRatings.updatedAt),
        asc(pvpRatings.userId),
      );
    const entrants = await buildCombatEntrants(tx, ranked);
    const bracket = resolveArenaTournament({
      seasonId: season.id,
      generatedAt: now,
      entrants,
      fight: (p1, p2) => {
        const p1Player = {
          ...p1.payload.combat.player,
          hp: p1.payload.combat.maxHp,
        };
        const p2Player = {
          ...p2.payload.combat.player,
          hp: p2.payload.combat.maxHp,
        };
        const battle = resolveBattlePvP(
          p1Player,
          p2Player,
          p1.participant.name,
          p2.participant.name,
          {
            ...autoDuelContext(),
            damageMultiplier: ARENA_DAMAGE_MULTIPLIER,
            v2Skills: { p1: p1.payload.skills, p2: p2.payload.skills },
          },
        );
        return {
          outcome: battle.outcome,
          turns: battle.turns,
          p1HpRatio:
            battle.finalState.p1.hp / Math.max(1, battle.finalState.p1.maxHp),
          p2HpRatio:
            battle.finalState.p2.hp / Math.max(1, battle.finalState.p2.maxHp),
        };
      },
    });

    if (bracket.rewards.length > 0) {
      await tx.insert(marketplaceInbox).values(
        bracket.rewards.map((reward) =>
          inboxValues({
            userId: reward.userId,
            payload: {
              kind: "season_reward",
              season: "pvp",
              coins: reward.coins,
            },
            message: `아레나 토너먼트 ${reward.placement} 보상 — ${reward.coins} 코인`,
          }),
        ),
      );
    }
    await tx.insert(pvpTournaments).values({
      seasonId: season.id,
      bracketSize: bracket.bracketSize,
      status: bracket.status,
      bracket,
      championUserId: bracket.championUserId,
      createdAt: now,
      completedAt: now,
      rewardsGrantedAt: bracket.rewards.length > 0 ? now : null,
    });
    return {
      kind: "ok" as const,
      seasonId: season.id,
      created: true,
      bracket,
    };
  });
}

export async function latestArenaTournament(): Promise<{
  seasonId: string;
  bracket: ArenaTournamentBracket;
} | null> {
  const row = await db
    .select()
    .from(pvpTournaments)
    .orderBy(desc(pvpTournaments.createdAt))
    .limit(1)
    .then((rows) => rows[0]);
  return row
    ? { seasonId: row.seasonId, bracket: bracketFromRow(row) }
    : null;
}
