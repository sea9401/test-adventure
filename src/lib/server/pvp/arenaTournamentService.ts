import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  economyEvents,
  marketplaceInbox,
  pvpRatings,
  pvpSeasons,
  pvpTournamentBets,
  pvpTournaments,
  savesKv,
  messages,
  users,
} from "@/db/schema";
import { ARENA_LOADOUTS_KEY, CHARACTER_STATE_KEY } from "@/lib/storage-keys";
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
import { excludeArenaOperatorAccounts } from "@/lib/server/arenaOperatorEligibility";
import { filterRankingEligibleRows } from "@/lib/server/rankingEligibility";
import {
  derivePlayerCombatV2,
  type DerivedPlayerCombatV2,
  type SavedCharacterV2,
} from "@/lib/server/derivePlayerCombatV2";
import { resolveBattlePvP } from "@/adventure/v2/combat/engine-pvp";
import { toPvpReplayPayload } from "@/adventure/data/v2/replayPayload";
import { readProfileValue } from "@/adventure/profile/profileValue";
import { autoDuelContext } from "@/adventure/v2/combat/duelOptions";
import {
  ARENA_DAMAGE_MULTIPLIER,
  ARENA_SUSTAIN_MULTIPLIER,
} from "@/lib/server/arena";
import { inboxValues } from "@/lib/server/inboxPayload";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { getOrCreateCurrentSeason } from "./season";
import {
  arenaChampionshipBadgeForPlacement,
  grantArenaChampionshipBadge,
  isArenaChampionshipWinner,
} from "@/adventure/data/v2/arenaChampionshipBadges";
import { ARENA_CHAMPION_TITLE_ID } from "@/adventure/data/titles";
import { grantTitleIfMissingInTx } from "@/lib/server/grantTitle";
import {
  ARENA_TOURNAMENT_MIN_MATCHES,
  arenaRankedEndsAt,
  arenaSeasonPhase,
  arenaTournamentSnapshotsAt,
  arenaTournamentStartsAt,
  arenaTournamentMatchNoticeText,
  createArenaTournamentSchedule,
  nextDueArenaTournamentMatch,
  resolveArenaTournamentScheduledMatch,
  type ArenaSeasonPhase,
  type ArenaTournamentBracket,
  type ArenaTournamentEntrant,
} from "./arenaTournament";
import {
  ARENA_TOURNAMENT_NOTICE_CLASS_NAME,
  arenaTournamentNoticeContent,
} from "@/lib/chat-config";

const PROFILE_KEY = "character-profile.v2";
const SYSTEM_USER_ID = "system";
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
type TournamentSnapshots = Record<string, TournamentCombatPayload>;
type TournamentRow = typeof pvpTournaments.$inferSelect;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type ArenaTournamentEnsureResult =
  | {
      kind: "ok";
      seasonId: string;
      created: boolean;
      processedMatches: number;
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

function tournamentProfile(value: unknown): { name: string; avatar: string } {
  const profile = readProfileValue(value);
  const raw = (value ?? {}) as { name?: unknown };
  const fallbackName =
    typeof raw.name === "string" && raw.name.trim().length > 0
      ? raw.name.trim()
      : "모험가";
  return {
    name: profile?.name.trim() || fallbackName,
    avatar: profile?.gender ?? "male1",
  };
}

function characterLevel(value: unknown): number {
  const raw = (value ?? {}) as { level?: unknown };
  return typeof raw.level === "number" && Number.isFinite(raw.level)
    ? Math.max(1, Math.floor(raw.level))
    : 1;
}

function characterGold(value: unknown): number {
  const raw = (value ?? {}) as { gold?: unknown };
  return typeof raw.gold === "number" && Number.isFinite(raw.gold)
    ? Math.max(0, Math.floor(raw.gold))
    : 0;
}

function bracketFromRow(row: TournamentRow): ArenaTournamentBracket {
  return row.bracket as ArenaTournamentBracket;
}

function snapshotsFromRow(row: TournamentRow): TournamentSnapshots {
  return (row.snapshots ?? {}) as TournamentSnapshots;
}

async function buildCombatEntrants(
  tx: Tx,
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
      includeCookingBuff: false,
    });
    if (!combat) continue;
    const profile = tournamentProfile(saves?.get(PROFILE_KEY));
    entrants.push({
      participant: {
        userId: rating.userId,
        name: profile.name,
        avatar: profile.avatar,
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

function tournamentSnapshotsFromEntrants(
  bracket: ArenaTournamentBracket,
  entrants: readonly ArenaTournamentEntrant<TournamentCombatPayload>[],
): TournamentSnapshots {
  const participantIds = new Set(
    bracket.participants.map((participant) => participant.userId),
  );
  return Object.fromEntries(
    entrants
      .filter((entrant) => participantIds.has(entrant.participant.userId))
      .map((entrant) => [entrant.participant.userId, entrant.payload]),
  );
}

/** 예선 대진은 유지하고, 본선 참가자의 현재 아레나 전투 세팅만 마감 시각에 다시 확정한다. */
async function freezeTournamentSnapshots(
  tx: Tx,
  row: TournamentRow,
  seasonEndAt: Date,
  now: Date,
): Promise<TournamentRow> {
  const bracket = bracketFromRow(row);
  if (
    bracket.version !== 2 ||
    bracket.snapshotsFrozenAt ||
    bracket.status === "completed" ||
    bracket.status === "not_enough_players" ||
    bracket.matches.some((match) => match.status === "completed") ||
    now.getTime() < arenaTournamentSnapshotsAt(seasonEndAt).getTime()
  ) {
    return row;
  }

  const ranked = [...bracket.participants]
    .sort((a, b) => a.qualifyingRank - b.qualifyingRank)
    .map((participant) => ({
      userId: participant.userId,
      rating: participant.rating,
      wins: participant.matches,
      losses: 0,
      draws: 0,
    }));
  const entrants = await buildCombatEntrants(tx, ranked);
  const snapshots = {
    ...snapshotsFromRow(row),
    ...tournamentSnapshotsFromEntrants(bracket, entrants),
  };
  const frozenBracket: ArenaTournamentBracket = {
    ...bracket,
    snapshotsFrozenAt: now.toISOString(),
  };
  await tx
    .update(pvpTournaments)
    .set({ bracket: frozenBracket, snapshots })
    .where(eq(pvpTournaments.seasonId, row.seasonId));
  return { ...row, bracket: frozenBracket, snapshots };
}

function fightTournamentMatch(
  p1: ArenaTournamentEntrant<TournamentCombatPayload>,
  p2: ArenaTournamentEntrant<TournamentCombatPayload>,
) {
  const p1Player = { ...p1.payload.combat.player, hp: p1.payload.combat.maxHp };
  const p2Player = { ...p2.payload.combat.player, hp: p2.payload.combat.maxHp };
  const battle = resolveBattlePvP(
    p1Player,
    p2Player,
    p1.participant.name,
    p2.participant.name,
    {
      ...autoDuelContext(),
      damageMultiplier: ARENA_DAMAGE_MULTIPLIER,
      sustainMultiplier: ARENA_SUSTAIN_MULTIPLIER,
      v2Skills: { p1: p1.payload.skills, p2: p2.payload.skills },
    },
  );
  return {
    outcome: battle.outcome,
    turns: battle.turns,
    p1HpRatio: battle.finalState.p1.hp / Math.max(1, battle.finalState.p1.maxHp),
    p2HpRatio: battle.finalState.p2.hp / Math.max(1, battle.finalState.p2.maxHp),
    replay: toPvpReplayPayload(battle.finalState, p2.participant.name),
  };
}

async function broadcastTournamentMatchResult(
  tx: Tx,
  bracket: ArenaTournamentBracket,
  match: ArenaTournamentBracket["matches"][number],
  now: Date,
): Promise<void> {
  await tx
    .insert(users)
    .values({ id: SYSTEM_USER_ID, email: "system@internal" })
    .onConflictDoNothing({ target: users.id });
  await tx.insert(messages).values({
    userId: SYSTEM_USER_ID,
    channel: "global",
    guildId: null,
    roomId: null,
    name: "시스템",
    className: ARENA_TOURNAMENT_NOTICE_CLASS_NAME,
    title: match.kind === "final" ? "아레나 결승" : "아레나 본선",
    content: arenaTournamentNoticeContent(
      arenaTournamentMatchNoticeText(bracket, match),
      bracket.seasonId,
      match.id,
    ),
    createdAt: now,
  });
}

async function refundRetiredMatchBets(
  tx: Tx,
  seasonId: string,
  matchId: string,
  now: Date,
): Promise<void> {
  const bets = await tx
    .select()
    .from(pvpTournamentBets)
    .where(
      and(
        eq(pvpTournamentBets.seasonId, seasonId),
        eq(pvpTournamentBets.matchId, matchId),
        eq(pvpTournamentBets.status, "pending"),
      ),
    )
    .orderBy(asc(pvpTournamentBets.userId))
    .for("update");
  for (const bet of bets) {
    const character = await lockSaveForUpdate<Record<string, unknown>>(
      tx,
      bet.userId,
      CHARACTER_STATE_KEY,
      {},
    );
    await upsertSave(tx, bet.userId, CHARACTER_STATE_KEY, {
      ...character,
      gold: characterGold(character) + bet.amount,
    });
    await tx.insert(economyEvents).values({
      userId: bet.userId,
      eventType: "refund.arena_tournament_bet.retired",
      goldDelta: bet.amount,
      itemKind: "arena_tournament_bet",
      itemId: matchId,
      quantity: 1,
      detail: { seasonId, matchId, reason: "feature_retired" },
    });
    await tx
      .update(pvpTournamentBets)
      .set({ status: "refunded", payout: bet.amount, settledAt: now })
      .where(
        and(
          eq(pvpTournamentBets.seasonId, seasonId),
          eq(pvpTournamentBets.matchId, matchId),
          eq(pvpTournamentBets.userId, bet.userId),
        ),
      );
  }
}

/** 남아 있는 모든 미정산 베팅을 기능 종료 환불로 전환한다. */
export async function refundRetiredArenaTournamentBets(now = new Date()) {
  return db.transaction(async (tx) => {
    const bets = await tx
      .select()
      .from(pvpTournamentBets)
      .where(eq(pvpTournamentBets.status, "pending"))
      .orderBy(
        asc(pvpTournamentBets.seasonId),
        asc(pvpTournamentBets.matchId),
        asc(pvpTournamentBets.userId),
      )
      .for("update");
    const credits = new Map<string, number>();
    for (const bet of bets) {
      credits.set(bet.userId, (credits.get(bet.userId) ?? 0) + bet.amount);
    }
    for (const userId of [...credits.keys()].sort()) {
      const amount = credits.get(userId) ?? 0;
      const character = await lockSaveForUpdate<Record<string, unknown>>(
        tx,
        userId,
        CHARACTER_STATE_KEY,
        {},
      );
      await upsertSave(tx, userId, CHARACTER_STATE_KEY, {
        ...character,
        gold: characterGold(character) + amount,
      });
      await tx.insert(economyEvents).values({
        userId,
        eventType: "refund.arena_tournament_bet.retired",
        goldDelta: amount,
        itemKind: "arena_tournament_bet",
        itemId: "feature_retired",
        quantity: bets.filter((bet) => bet.userId === userId).length,
        detail: { reason: "feature_retired", actualGoldDelta: amount },
      });
    }
    for (const bet of bets) {
      await tx
        .update(pvpTournamentBets)
        .set({ status: "refunded", payout: bet.amount, settledAt: now })
        .where(
          and(
            eq(pvpTournamentBets.seasonId, bet.seasonId),
            eq(pvpTournamentBets.matchId, bet.matchId),
            eq(pvpTournamentBets.userId, bet.userId),
            eq(pvpTournamentBets.status, "pending"),
          ),
        );
    }
    return {
      refundedBets: bets.length,
      refundedUsers: credits.size,
      refundedGold: [...credits.values()].reduce((sum, amount) => sum + amount, 0),
    };
  });
}

async function advanceTournament(
  tx: Tx,
  row: TournamentRow,
  now: Date,
): Promise<{ bracket: ArenaTournamentBracket; processedMatches: number }> {
  let bracket = bracketFromRow(row);
  if (
    bracket.version !== 2 ||
    bracket.status === "completed" ||
    bracket.status === "not_enough_players"
  ) {
    return { bracket, processedMatches: 0 };
  }
  const snapshots = snapshotsFromRow(row);
  const entrants = bracket.participants
    .map((participant) => {
      const payload = snapshots[participant.userId];
      return payload ? { participant, payload } : null;
    })
    .filter((entrant): entrant is ArenaTournamentEntrant<TournamentCombatPayload> => entrant != null);
  let processedMatches = 0;
  for (;;) {
    const due = nextDueArenaTournamentMatch(bracket, now);
    if (!due) break;
    bracket = resolveArenaTournamentScheduledMatch({
      bracket,
      matchId: due.id,
      entrants,
      fight: fightTournamentMatch,
    });
    const resolved = bracket.matches.find((match) => match.id === due.id)!;
    await refundRetiredMatchBets(tx, row.seasonId, due.id, now);
    await broadcastTournamentMatchResult(tx, bracket, resolved, now);
    processedMatches += 1;
  }

  let rewardsGrantedAt = row.rewardsGrantedAt;
  if (bracket.status === "completed" && !rewardsGrantedAt) {
    for (const reward of bracket.rewards) {
      const badge = arenaChampionshipBadgeForPlacement(reward.placement);
      if (!badge) continue;
      const character = await lockSaveForUpdate<Record<string, unknown>>(
        tx,
        reward.userId,
        CHARACTER_STATE_KEY,
        {},
      );
      await upsertSave(tx, reward.userId, CHARACTER_STATE_KEY, {
        ...character,
        arenaChampionshipBadges: grantArenaChampionshipBadge(
          character.arenaChampionshipBadges,
          badge,
        ),
      });
      if (isArenaChampionshipWinner(reward.placement)) {
        await grantTitleIfMissingInTx(
          tx,
          reward.userId,
          ARENA_CHAMPION_TITLE_ID,
          now.getTime(),
        );
      }
    }
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
    rewardsGrantedAt = now;
  }
  if (processedMatches > 0 || rewardsGrantedAt !== row.rewardsGrantedAt) {
    await tx
      .update(pvpTournaments)
      .set({
        status: bracket.status,
        bracket,
        championUserId: bracket.championUserId,
        completedAt: bracket.status === "completed" ? now : null,
        rewardsGrantedAt,
      })
      .where(eq(pvpTournaments.seasonId, row.seasonId));
  }
  return { bracket, processedMatches };
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
    let row = await tx
      .select()
      .from(pvpTournaments)
      .where(eq(pvpTournaments.seasonId, season.id))
      .for("update")
      .limit(1)
      .then((rows) => rows[0]);
    let created = false;
    if (!row) {
      const rankedRows = await tx
        .select({
          userId: pvpRatings.userId,
          email: users.email,
          bannedUntil: users.bannedUntil,
          rating: pvpRatings.rating,
          wins: pvpRatings.wins,
          losses: pvpRatings.losses,
          draws: pvpRatings.draws,
        })
        .from(pvpRatings)
        .innerJoin(users, eq(users.id, pvpRatings.userId))
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
      const ranked = excludeArenaOperatorAccounts(
        filterRankingEligibleRows(rankedRows, now),
      );
      const entrants = await buildCombatEntrants(tx, ranked);
      const bracket = createArenaTournamentSchedule({
        seasonId: season.id,
        generatedAt: now,
        startsAt: arenaTournamentStartsAt(season.endAt),
        entrants,
      });
      if (now.getTime() >= arenaTournamentSnapshotsAt(season.endAt).getTime()) {
        bracket.snapshotsFrozenAt = now.toISOString();
      }
      const snapshots = tournamentSnapshotsFromEntrants(bracket, entrants);
      row = await tx
        .insert(pvpTournaments)
        .values({
          seasonId: season.id,
          bracketSize: bracket.bracketSize,
          status: bracket.status,
          bracket,
          snapshots,
          createdAt: now,
          completedAt: bracket.status === "not_enough_players" ? now : null,
        })
        .returning()
        .then((rows) => rows[0]!);
      created = true;
    }
    row = await freezeTournamentSnapshots(tx, row, season.endAt, now);
    const advanced = await advanceTournament(tx, row, now);
    return {
      kind: "ok" as const,
      seasonId: season.id,
      created,
      processedMatches: advanced.processedMatches,
      bracket: advanced.bracket,
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
  return row ? { seasonId: row.seasonId, bracket: bracketFromRow(row) } : null;
}
