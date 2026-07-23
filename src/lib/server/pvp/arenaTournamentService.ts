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
import {
  derivePlayerCombatV2,
  type DerivedPlayerCombatV2,
  type SavedCharacterV2,
} from "@/lib/server/derivePlayerCombatV2";
import { resolveBattlePvP } from "@/adventure/v2/combat/engine-pvp";
import { autoDuelContext } from "@/adventure/v2/combat/duelOptions";
import { ARENA_DAMAGE_MULTIPLIER } from "@/lib/server/arena";
import { inboxValues } from "@/lib/server/inboxPayload";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { getOrCreateCurrentSeason } from "./season";
import {
  arenaChampionshipBadgeForPlacement,
  grantArenaChampionshipBadge,
} from "@/adventure/data/v2/arenaChampionshipBadges";
import {
  ARENA_TOURNAMENT_BET_CLOSE_MS,
  ARENA_TOURNAMENT_BET_MAX_GOLD,
  ARENA_TOURNAMENT_BET_MIN_GOLD,
  ARENA_TOURNAMENT_BET_SEASON_MAX_GOLD,
  ARENA_TOURNAMENT_MIN_MATCHES,
  arenaRankedEndsAt,
  arenaSeasonPhase,
  arenaTournamentBetPayouts,
  arenaTournamentStartsAt,
  createArenaTournamentSchedule,
  nextDueArenaTournamentMatch,
  resolveArenaTournamentScheduledMatch,
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

export type ArenaTournamentBetResult =
  | { kind: "ok"; amount: number; gold: number }
  | {
      kind:
        | "not_open"
        | "tournament_missing"
        | "match_missing"
        | "match_not_ready"
        | "betting_closed"
        | "invalid_choice"
        | "own_match"
        | "invalid_amount"
        | "already_bet"
        | "season_limit"
        | "insufficient_gold";
      remainingGold?: number;
    };

export type ArenaTournamentBetView = {
  pools: Array<{
    matchId: string;
    total: number;
    choices: Record<string, number>;
  }>;
  myBets: Array<{
    matchId: string;
    chosenUserId: string;
    amount: number;
    status: string;
    payout: number;
  }>;
  limits: {
    minimum: number;
    maximum: number;
    seasonMaximum: number;
    closeBeforeSeconds: number;
    feePercent: number;
  };
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
      v2Skills: { p1: p1.payload.skills, p2: p2.payload.skills },
    },
  );
  return {
    outcome: battle.outcome,
    turns: battle.turns,
    p1HpRatio: battle.finalState.p1.hp / Math.max(1, battle.finalState.p1.maxHp),
    p2HpRatio: battle.finalState.p2.hp / Math.max(1, battle.finalState.p2.maxHp),
  };
}

async function settleMatchBets(
  tx: Tx,
  seasonId: string,
  matchId: string,
  winnerUserId: string,
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
  const settlement = arenaTournamentBetPayouts({
    winnerUserId,
    bets: bets.map((bet) => ({
      userId: bet.userId,
      chosenUserId: bet.chosenUserId,
      amount: bet.amount,
    })),
  });
  for (const payout of settlement.payouts) {
    if (payout.amount > 0) {
      const character = await lockSaveForUpdate<Record<string, unknown>>(
        tx,
        payout.userId,
        CHARACTER_STATE_KEY,
        {},
      );
      await upsertSave(tx, payout.userId, CHARACTER_STATE_KEY, {
        ...character,
        gold: characterGold(character) + payout.amount,
      });
      await tx.insert(economyEvents).values({
        userId: payout.userId,
        eventType:
          payout.status === "refunded"
            ? "refund.arena_tournament_bet"
            : "source.arena_tournament_bet",
        goldDelta: payout.amount,
        itemKind: "arena_tournament_bet",
        itemId: matchId,
        quantity: 1,
        detail: { seasonId, matchId, status: payout.status },
      });
    }
    await tx
      .update(pvpTournamentBets)
      .set({ status: payout.status, payout: payout.amount, settledAt: now })
      .where(
        and(
          eq(pvpTournamentBets.seasonId, seasonId),
          eq(pvpTournamentBets.matchId, matchId),
          eq(pvpTournamentBets.userId, payout.userId),
        ),
      );
  }
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
    await settleMatchBets(tx, row.seasonId, due.id, resolved.winnerUserId!, now);
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
      const bracket = createArenaTournamentSchedule({
        seasonId: season.id,
        generatedAt: now,
        startsAt: arenaTournamentStartsAt(season.endAt),
        entrants,
      });
      const snapshots = Object.fromEntries(
        entrants
          .filter((entrant) =>
            bracket.participants.some(
              (participant) => participant.userId === entrant.participant.userId,
            ),
          )
          .map((entrant) => [entrant.participant.userId, entrant.payload]),
      );
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

export async function placeArenaTournamentBet(args: {
  userId: string;
  matchId: string;
  chosenUserId: string;
  amount: number;
  now?: Date;
}): Promise<ArenaTournamentBetResult> {
  const now = args.now ?? new Date();
  const amount = Math.floor(args.amount);
  if (
    !Number.isSafeInteger(args.amount) ||
    amount < ARENA_TOURNAMENT_BET_MIN_GOLD ||
    amount > ARENA_TOURNAMENT_BET_MAX_GOLD
  ) {
    return { kind: "invalid_amount" };
  }
  const season = await getOrCreateCurrentSeason(now);
  if (arenaSeasonPhase(season.endAt, now) !== "tournament") {
    return { kind: "not_open" };
  }

  return db.transaction(async (tx) => {
    const row = await tx
      .select()
      .from(pvpTournaments)
      .where(eq(pvpTournaments.seasonId, season.id))
      .for("update")
      .limit(1)
      .then((rows) => rows[0]);
    if (!row) return { kind: "tournament_missing" as const };
    const bracket = bracketFromRow(row);
    const match = bracket.matches.find((candidate) => candidate.id === args.matchId);
    if (!match) return { kind: "match_missing" as const };
    if (!match.p1UserId || !match.p2UserId || match.status !== "scheduled") {
      return { kind: "match_not_ready" as const };
    }
    if (
      now.getTime() >=
      new Date(match.scheduledAt).getTime() - ARENA_TOURNAMENT_BET_CLOSE_MS
    ) {
      return { kind: "betting_closed" as const };
    }
    if (![match.p1UserId, match.p2UserId].includes(args.chosenUserId)) {
      return { kind: "invalid_choice" as const };
    }
    if ([match.p1UserId, match.p2UserId].includes(args.userId)) {
      return { kind: "own_match" as const };
    }
    const existing = await tx
      .select({ userId: pvpTournamentBets.userId })
      .from(pvpTournamentBets)
      .where(
        and(
          eq(pvpTournamentBets.seasonId, season.id),
          eq(pvpTournamentBets.matchId, args.matchId),
          eq(pvpTournamentBets.userId, args.userId),
        ),
      )
      .limit(1);
    if (existing[0]) return { kind: "already_bet" as const };
    const seasonBets = await tx
      .select({ amount: pvpTournamentBets.amount })
      .from(pvpTournamentBets)
      .where(
        and(
          eq(pvpTournamentBets.seasonId, season.id),
          eq(pvpTournamentBets.userId, args.userId),
        ),
      );
    const used = seasonBets.reduce((sum, bet) => sum + bet.amount, 0);
    if (used + amount > ARENA_TOURNAMENT_BET_SEASON_MAX_GOLD) {
      return {
        kind: "season_limit" as const,
        remainingGold: Math.max(0, ARENA_TOURNAMENT_BET_SEASON_MAX_GOLD - used),
      };
    }
    const character = await lockSaveForUpdate<Record<string, unknown>>(
      tx,
      args.userId,
      CHARACTER_STATE_KEY,
      {},
    );
    const gold = characterGold(character);
    if (gold < amount) {
      return { kind: "insufficient_gold" as const, remainingGold: gold };
    }
    await upsertSave(tx, args.userId, CHARACTER_STATE_KEY, {
      ...character,
      gold: gold - amount,
    });
    await tx.insert(pvpTournamentBets).values({
      seasonId: season.id,
      matchId: args.matchId,
      userId: args.userId,
      chosenUserId: args.chosenUserId,
      amount,
      createdAt: now,
    });
    await tx.insert(economyEvents).values({
      userId: args.userId,
      eventType: "sink.arena_tournament_bet",
      goldDelta: -amount,
      itemKind: "arena_tournament_bet",
      itemId: args.matchId,
      quantity: 1,
      detail: {
        seasonId: season.id,
        matchId: args.matchId,
        chosenUserId: args.chosenUserId,
      },
    });
    return { kind: "ok" as const, amount, gold: gold - amount };
  });
}

export async function arenaTournamentBetView(
  seasonId: string,
  userId: string,
): Promise<ArenaTournamentBetView> {
  const bets = await db
    .select()
    .from(pvpTournamentBets)
    .where(eq(pvpTournamentBets.seasonId, seasonId))
    .orderBy(asc(pvpTournamentBets.createdAt));
  const poolsByMatch = new Map<string, Map<string, number>>();
  for (const bet of bets) {
    const choices = poolsByMatch.get(bet.matchId) ?? new Map<string, number>();
    choices.set(bet.chosenUserId, (choices.get(bet.chosenUserId) ?? 0) + bet.amount);
    poolsByMatch.set(bet.matchId, choices);
  }
  return {
    pools: [...poolsByMatch].map(([matchId, choices]) => ({
      matchId,
      total: [...choices.values()].reduce((sum, amount) => sum + amount, 0),
      choices: Object.fromEntries(choices),
    })),
    myBets: bets
      .filter((bet) => bet.userId === userId)
      .map((bet) => ({
        matchId: bet.matchId,
        chosenUserId: bet.chosenUserId,
        amount: bet.amount,
        status: bet.status,
        payout: bet.payout,
      })),
    limits: {
      minimum: ARENA_TOURNAMENT_BET_MIN_GOLD,
      maximum: ARENA_TOURNAMENT_BET_MAX_GOLD,
      seasonMaximum: ARENA_TOURNAMENT_BET_SEASON_MAX_GOLD,
      closeBeforeSeconds: ARENA_TOURNAMENT_BET_CLOSE_MS / 1000,
      feePercent: 5,
    },
  };
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
