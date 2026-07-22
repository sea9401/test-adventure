export const ARENA_TOURNAMENT_MIN_MATCHES = 10;
export const ARENA_TOURNAMENT_MAX_SIZE = 32;
export const ARENA_TOURNAMENT_MIN_SIZE = 8;
export const ARENA_TOURNAMENT_DAY_MS = 24 * 60 * 60 * 1000;
export const ARENA_TOURNAMENT_MAX_GAMES_PER_MATCH = 5;

export type ArenaSeasonPhase = "ranked" | "tournament" | "closed";

export type ArenaTournamentParticipant = {
  userId: string;
  name: string;
  level: number;
  qualifyingRank: number;
  rating: number;
  matches: number;
};

export type ArenaTournamentGame = {
  game: number;
  outcome: "p1_win" | "p2_win" | "draw";
  turns: number;
  p1HpRatio: number;
  p2HpRatio: number;
};

export type ArenaTournamentMatch = {
  id: string;
  round: number;
  roundName: string;
  slot: number;
  p1UserId: string;
  p2UserId: string;
  p1Wins: number;
  p2Wins: number;
  winnerUserId: string;
  loserUserId: string;
  decidedBy: "wins" | "hp" | "seed";
  games: ArenaTournamentGame[];
};

export type ArenaTournamentReward = {
  userId: string;
  placement: string;
  coins: number;
};

export type ArenaTournamentBracket = {
  version: 1;
  seasonId: string;
  bracketSize: number;
  minimumMatches: number;
  generatedAt: string;
  status: "completed" | "not_enough_players";
  participants: ArenaTournamentParticipant[];
  matches: ArenaTournamentMatch[];
  championUserId: string | null;
  rewards: ArenaTournamentReward[];
};

export type ArenaTournamentFightResult = {
  outcome: "p1_win" | "p2_win" | "draw";
  turns: number;
  p1HpRatio: number;
  p2HpRatio: number;
};

export type ArenaTournamentEntrant<T> = {
  participant: ArenaTournamentParticipant;
  payload: T;
};

export function arenaRankedEndsAt(seasonEndAt: Date): Date {
  return new Date(seasonEndAt.getTime() - ARENA_TOURNAMENT_DAY_MS);
}

export function arenaSeasonPhase(
  seasonEndAt: Date,
  now: Date = new Date(),
): ArenaSeasonPhase {
  if (now.getTime() >= seasonEndAt.getTime()) return "closed";
  return now.getTime() >= arenaRankedEndsAt(seasonEndAt).getTime()
    ? "tournament"
    : "ranked";
}

export function arenaTournamentBracketSize(eligibleCount: number): number {
  const count = Math.max(0, Math.floor(eligibleCount));
  if (count >= 32) return 32;
  if (count >= 16) return 16;
  if (count >= 8) return 8;
  return 0;
}

function shuffled<T>(values: readonly T[], rng: () => number): T[] {
  const out = [...values];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.min(i, Math.floor(Math.max(0, rng()) * (i + 1)));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** 1·4포트, 2·3포트를 섞어 첫 경기에서 상위권끼리 만나는 일을 줄인다. */
export function arenaTournamentFirstRoundPairs<T>(
  entrants: readonly ArenaTournamentEntrant<T>[],
  rng: () => number = Math.random,
): Array<[
  ArenaTournamentEntrant<T>,
  ArenaTournamentEntrant<T>,
]> {
  const size = arenaTournamentBracketSize(entrants.length);
  if (size === 0 || entrants.length !== size) return [];
  const ordered = [...entrants].sort(
    (a, b) =>
      a.participant.qualifyingRank - b.participant.qualifyingRank ||
      a.participant.userId.localeCompare(b.participant.userId),
  );
  const potSize = size / 4;
  const pot1 = shuffled(ordered.slice(0, potSize), rng);
  const pot2 = shuffled(ordered.slice(potSize, potSize * 2), rng);
  const pot3 = shuffled(ordered.slice(potSize * 2, potSize * 3), rng);
  const pot4 = shuffled(ordered.slice(potSize * 3, potSize * 4), rng);
  const pairs: Array<[
    ArenaTournamentEntrant<T>,
    ArenaTournamentEntrant<T>,
  ]> = [];
  for (let i = 0; i < potSize; i += 1) {
    pairs.push([pot1[i]!, pot4[i]!]);
    pairs.push([pot2[i]!, pot3[i]!]);
  }
  return pairs;
}

export function arenaTournamentRoundName(
  bracketSize: number,
  round: number,
): string {
  const remaining = bracketSize / 2 ** (round - 1);
  if (remaining === 2) return "결승";
  if (remaining === 4) return "준결승";
  return `${remaining}강`;
}

function finiteRatio(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.max(0, Math.min(1, value)) * 10_000) / 10_000;
}

function resolveMatch<T>(args: {
  seasonId: string;
  bracketSize: number;
  round: number;
  slot: number;
  p1: ArenaTournamentEntrant<T>;
  p2: ArenaTournamentEntrant<T>;
  fight: (
    p1: ArenaTournamentEntrant<T>,
    p2: ArenaTournamentEntrant<T>,
    game: number,
  ) => ArenaTournamentFightResult;
}): {
  match: ArenaTournamentMatch;
  winner: ArenaTournamentEntrant<T>;
} {
  let p1Wins = 0;
  let p2Wins = 0;
  let p1HpTotal = 0;
  let p2HpTotal = 0;
  const games: ArenaTournamentGame[] = [];
  for (let game = 1; game <= ARENA_TOURNAMENT_MAX_GAMES_PER_MATCH; game += 1) {
    const result = args.fight(args.p1, args.p2, game);
    const p1HpRatio = finiteRatio(result.p1HpRatio);
    const p2HpRatio = finiteRatio(result.p2HpRatio);
    games.push({
      game,
      outcome: result.outcome,
      turns: Math.max(0, Math.floor(result.turns)),
      p1HpRatio,
      p2HpRatio,
    });
    p1HpTotal += p1HpRatio;
    p2HpTotal += p2HpRatio;
    if (result.outcome === "p1_win") p1Wins += 1;
    if (result.outcome === "p2_win") p2Wins += 1;
    if (p1Wins >= 2 || p2Wins >= 2) break;
  }

  let winner = p1Wins > p2Wins ? args.p1 : p2Wins > p1Wins ? args.p2 : null;
  let decidedBy: ArenaTournamentMatch["decidedBy"] = "wins";
  if (!winner) {
    if (p1HpTotal !== p2HpTotal) {
      winner = p1HpTotal > p2HpTotal ? args.p1 : args.p2;
      decidedBy = "hp";
    } else {
      winner =
        args.p1.participant.qualifyingRank <=
        args.p2.participant.qualifyingRank
          ? args.p1
          : args.p2;
      decidedBy = "seed";
    }
  }
  const loser = winner === args.p1 ? args.p2 : args.p1;
  return {
    winner,
    match: {
      id: `${args.seasonId}-r${args.round}-m${args.slot}`,
      round: args.round,
      roundName: arenaTournamentRoundName(args.bracketSize, args.round),
      slot: args.slot,
      p1UserId: args.p1.participant.userId,
      p2UserId: args.p2.participant.userId,
      p1Wins,
      p2Wins,
      winnerUserId: winner.participant.userId,
      loserUserId: loser.participant.userId,
      decidedBy,
      games,
    },
  };
}

export function arenaTournamentRewardFor(args: {
  isChampion: boolean;
  eliminatedRound: number | undefined;
  totalRounds: number;
}): { placement: string; coins: number } {
  if (args.isChampion) return { placement: "우승", coins: 600 };
  if (args.eliminatedRound === args.totalRounds) {
    return { placement: "준우승", coins: 400 };
  }
  if (args.eliminatedRound === args.totalRounds - 1) {
    return { placement: "4강", coins: 250 };
  }
  if (args.eliminatedRound === args.totalRounds - 2) {
    return { placement: "8강", coins: 150 };
  }
  return { placement: "본선 진출", coins: 100 };
}

export function resolveArenaTournament<T>(args: {
  seasonId: string;
  generatedAt: Date;
  entrants: readonly ArenaTournamentEntrant<T>[];
  fight: (
    p1: ArenaTournamentEntrant<T>,
    p2: ArenaTournamentEntrant<T>,
    game: number,
  ) => ArenaTournamentFightResult;
  rng?: () => number;
}): ArenaTournamentBracket {
  const bracketSize = arenaTournamentBracketSize(args.entrants.length);
  const selected = [...args.entrants]
    .sort(
      (a, b) =>
        a.participant.qualifyingRank - b.participant.qualifyingRank ||
        a.participant.userId.localeCompare(b.participant.userId),
    )
    .slice(0, bracketSize);
  const participants = selected.map((entrant) => entrant.participant);
  if (bracketSize === 0) {
    return {
      version: 1,
      seasonId: args.seasonId,
      bracketSize: 0,
      minimumMatches: ARENA_TOURNAMENT_MIN_MATCHES,
      generatedAt: args.generatedAt.toISOString(),
      status: "not_enough_players",
      participants,
      matches: [],
      championUserId: null,
      rewards: [],
    };
  }

  let pairs = arenaTournamentFirstRoundPairs(selected, args.rng ?? Math.random);
  let round = 1;
  const matches: ArenaTournamentMatch[] = [];
  const eliminatedRound = new Map<string, number>();
  while (pairs.length > 0) {
    const winners: ArenaTournamentEntrant<T>[] = [];
    for (let slot = 0; slot < pairs.length; slot += 1) {
      const [p1, p2] = pairs[slot]!;
      const resolved = resolveMatch({
        seasonId: args.seasonId,
        bracketSize,
        round,
        slot: slot + 1,
        p1,
        p2,
        fight: args.fight,
      });
      matches.push(resolved.match);
      winners.push(resolved.winner);
      eliminatedRound.set(resolved.match.loserUserId, round);
    }
    if (winners.length === 1) {
      const championUserId = winners[0]!.participant.userId;
      const totalRounds = Math.log2(bracketSize);
      const rewards = participants.map((participant) => ({
        userId: participant.userId,
        ...arenaTournamentRewardFor({
          isChampion: participant.userId === championUserId,
          eliminatedRound: eliminatedRound.get(participant.userId),
          totalRounds,
        }),
      }));
      return {
        version: 1,
        seasonId: args.seasonId,
        bracketSize,
        minimumMatches: ARENA_TOURNAMENT_MIN_MATCHES,
        generatedAt: args.generatedAt.toISOString(),
        status: "completed",
        participants,
        matches,
        championUserId,
        rewards,
      };
    }
    pairs = [];
    for (let i = 0; i < winners.length; i += 2) {
      pairs.push([winners[i]!, winners[i + 1]!]);
    }
    round += 1;
  }

  throw new Error("arena tournament bracket did not produce a champion");
}
