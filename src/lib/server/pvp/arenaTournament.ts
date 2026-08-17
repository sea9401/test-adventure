import type { ReplayPayload } from "@/adventure/data/v2/replayPayload";
import type { Avatar } from "@/adventure/profile/avatars";

export const ARENA_TOURNAMENT_MIN_MATCHES = 10;
export const ARENA_TOURNAMENT_MAX_SIZE = 32;
export const ARENA_TOURNAMENT_MIN_SIZE = 8;
export const ARENA_TOURNAMENT_DAY_MS = 24 * 60 * 60 * 1000;
export const ARENA_TOURNAMENT_START_BEFORE_END_MS = 11 * 60 * 60 * 1000;
export const ARENA_TOURNAMENT_SNAPSHOT_BEFORE_END_MS = 12 * 60 * 60 * 1000;
export const ARENA_TOURNAMENT_ROUND_INTERVAL_MS = 5 * 60 * 1000;
export const ARENA_TOURNAMENT_MAX_GAMES_PER_MATCH = 5;

export type ArenaSeasonPhase = "ranked" | "tournament" | "closed";
export type ArenaTournamentStatus =
  | "scheduled"
  | "in_progress"
  | "completed"
  | "not_enough_players";

export type ArenaTournamentParticipant = {
  userId: string;
  name: string;
  avatar?: Avatar;
  /** 공개 응답에서 시즌별 불명예 처리로 신원을 가린 참가자. DB 원본 참가자에는 생략한다. */
  dishonored?: boolean;
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
  /** DB bracket 에만 저장하고 목록 API에서는 hasReplay 로 축약한다. */
  replay?: ReplayPayload;
  hasReplay?: boolean;
};

export type ArenaTournamentMatch = {
  id: string;
  kind: "elimination" | "third_place" | "final";
  round: number;
  roundName: string;
  slot: number;
  sequence: number;
  scheduledAt: string;
  status: "scheduled" | "completed";
  p1SourceMatchId: string | null;
  p2SourceMatchId: string | null;
  p1SourceResult: "winner" | "loser";
  p2SourceResult: "winner" | "loser";
  p1UserId: string | null;
  p2UserId: string | null;
  p1Wins: number;
  p2Wins: number;
  winnerUserId: string | null;
  loserUserId: string | null;
  decidedBy: "wins" | "hp" | "seed" | null;
  games: ArenaTournamentGame[];
};

export type ArenaTournamentReward = {
  userId: string;
  placement: string;
  coins: number;
};

export type ArenaTournamentBracket = {
  version: 2;
  seasonId: string;
  bracketSize: number;
  minimumMatches: number;
  generatedAt: string;
  /** 전투 장비·스킬·패턴을 마지막으로 확정한 시각. 구버전 대진은 없을 수 있다. */
  snapshotsFrozenAt?: string;
  startsAt: string;
  status: ArenaTournamentStatus;
  /** 경기 결과는 유지하되 공개 화면에서 신원을 영구히 가릴 시즌별 참가자 목록. */
  dishonoredUserIds?: string[];
  participants: ArenaTournamentParticipant[];
  matches: ArenaTournamentMatch[];
  championUserId: string | null;
  rewards: ArenaTournamentReward[];
};

export function stripArenaTournamentReplays(
  bracket: ArenaTournamentBracket,
): { bracket: ArenaTournamentBracket; removed: number } {
  let removed = 0;
  const matches = bracket.matches.map((match) => ({
    ...match,
    games: match.games.map((game) => {
      if (game.replay == null) return game;
      removed += 1;
      const { replay: _replay, ...summary } = game;
      return summary;
    }),
  }));
  return {
    bracket: removed > 0 ? { ...bracket, matches } : bracket,
    removed,
  };
}

export type ArenaTournamentFightResult = {
  outcome: "p1_win" | "p2_win" | "draw";
  turns: number;
  p1HpRatio: number;
  p2HpRatio: number;
  replay?: ReplayPayload;
};

export type ArenaTournamentEntrant<T> = {
  participant: ArenaTournamentParticipant;
  payload: T;
};

export function arenaRankedEndsAt(seasonEndAt: Date): Date {
  return new Date(seasonEndAt.getTime() - ARENA_TOURNAMENT_DAY_MS);
}

export function arenaTournamentStartsAt(seasonEndAt: Date): Date {
  return new Date(
    seasonEndAt.getTime() - ARENA_TOURNAMENT_START_BEFORE_END_MS,
  );
}

export function arenaTournamentSnapshotsAt(seasonEndAt: Date): Date {
  return new Date(
    seasonEndAt.getTime() - ARENA_TOURNAMENT_SNAPSHOT_BEFORE_END_MS,
  );
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
): Array<[ArenaTournamentEntrant<T>, ArenaTournamentEntrant<T>]> {
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
  const pairs: Array<[ArenaTournamentEntrant<T>, ArenaTournamentEntrant<T>]> = [];
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

function matchId(seasonId: string, round: number, slot: number): string {
  return `${seasonId}-r${round}-m${slot}`;
}

export function createArenaTournamentSchedule<T>(args: {
  seasonId: string;
  generatedAt: Date;
  startsAt: Date;
  entrants: readonly ArenaTournamentEntrant<T>[];
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
      version: 2,
      seasonId: args.seasonId,
      bracketSize: 0,
      minimumMatches: ARENA_TOURNAMENT_MIN_MATCHES,
      generatedAt: args.generatedAt.toISOString(),
      startsAt: args.startsAt.toISOString(),
      status: "not_enough_players",
      participants,
      matches: [],
      championUserId: null,
      rewards: [],
    };
  }

  const firstRound = arenaTournamentFirstRoundPairs(
    selected,
    args.rng ?? Math.random,
  );
  const totalRounds = Math.log2(bracketSize);
  const matches: ArenaTournamentMatch[] = [];
  let sequence = 1;
  for (let round = 1; round < totalRounds; round += 1) {
    const matchCount = bracketSize / 2 ** round;
    for (let slot = 1; slot <= matchCount; slot += 1) {
      const firstPair = round === 1 ? firstRound[slot - 1] : null;
      matches.push({
        id: matchId(args.seasonId, round, slot),
        kind: "elimination",
        round,
        roundName: arenaTournamentRoundName(bracketSize, round),
        slot,
        sequence,
        scheduledAt: new Date(
          args.startsAt.getTime() +
            (round - 1) * ARENA_TOURNAMENT_ROUND_INTERVAL_MS,
        ).toISOString(),
        status: "scheduled",
        p1SourceMatchId:
          round === 1 ? null : matchId(args.seasonId, round - 1, slot * 2 - 1),
        p2SourceMatchId:
          round === 1 ? null : matchId(args.seasonId, round - 1, slot * 2),
        p1SourceResult: "winner",
        p2SourceResult: "winner",
        p1UserId: firstPair?.[0].participant.userId ?? null,
        p2UserId: firstPair?.[1].participant.userId ?? null,
        p1Wins: 0,
        p2Wins: 0,
        winnerUserId: null,
        loserUserId: null,
        decidedBy: null,
        games: [],
      });
      sequence += 1;
    }
  }

  const semifinalRound = totalRounds - 1;
  const podiumAt = new Date(
    args.startsAt.getTime() +
      (totalRounds - 1) * ARENA_TOURNAMENT_ROUND_INTERVAL_MS,
  ).toISOString();
  matches.push({
    id: `${args.seasonId}-third-place`,
    kind: "third_place",
    round: totalRounds,
    roundName: "3·4위전",
    slot: 1,
    sequence,
    scheduledAt: podiumAt,
    status: "scheduled",
    p1SourceMatchId: matchId(args.seasonId, semifinalRound, 1),
    p2SourceMatchId: matchId(args.seasonId, semifinalRound, 2),
    p1SourceResult: "loser",
    p2SourceResult: "loser",
    p1UserId: null,
    p2UserId: null,
    p1Wins: 0,
    p2Wins: 0,
    winnerUserId: null,
    loserUserId: null,
    decidedBy: null,
    games: [],
  });
  sequence += 1;
  matches.push({
    id: matchId(args.seasonId, totalRounds + 1, 1),
    kind: "final",
    round: totalRounds + 1,
    roundName: "결승",
    slot: 1,
    sequence,
    scheduledAt: new Date(
      args.startsAt.getTime() +
        totalRounds * ARENA_TOURNAMENT_ROUND_INTERVAL_MS,
    ).toISOString(),
    status: "scheduled",
    p1SourceMatchId: matchId(args.seasonId, semifinalRound, 1),
    p2SourceMatchId: matchId(args.seasonId, semifinalRound, 2),
    p1SourceResult: "winner",
    p2SourceResult: "winner",
    p1UserId: null,
    p2UserId: null,
    p1Wins: 0,
    p2Wins: 0,
    winnerUserId: null,
    loserUserId: null,
    decidedBy: null,
    games: [],
  });

  return {
    version: 2,
    seasonId: args.seasonId,
    bracketSize,
    minimumMatches: ARENA_TOURNAMENT_MIN_MATCHES,
    generatedAt: args.generatedAt.toISOString(),
    startsAt: args.startsAt.toISOString(),
    status: "scheduled",
    participants,
    matches,
    championUserId: null,
    rewards: [],
  };
}

function finiteRatio(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.max(0, Math.min(1, value)) * 10_000) / 10_000;
}

function resolveMatch<T>(args: {
  match: ArenaTournamentMatch;
  p1: ArenaTournamentEntrant<T>;
  p2: ArenaTournamentEntrant<T>;
  fight: (
    p1: ArenaTournamentEntrant<T>,
    p2: ArenaTournamentEntrant<T>,
    game: number,
  ) => ArenaTournamentFightResult;
}): ArenaTournamentMatch {
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
      replay: result.replay,
    });
    p1HpTotal += p1HpRatio;
    p2HpTotal += p2HpRatio;
    if (result.outcome === "p1_win") p1Wins += 1;
    if (result.outcome === "p2_win") p2Wins += 1;
    if (p1Wins >= 2 || p2Wins >= 2) break;
  }

  let winner = p1Wins > p2Wins ? args.p1 : p2Wins > p1Wins ? args.p2 : null;
  let decidedBy: NonNullable<ArenaTournamentMatch["decidedBy"]> = "wins";
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
    ...args.match,
    status: "completed",
    p1Wins,
    p2Wins,
    winnerUserId: winner.participant.userId,
    loserUserId: loser.participant.userId,
    decidedBy,
    games,
  };
}

/** 목록 폴링 응답에서 큰 전투 로그를 떼고 링크 표시용 존재 여부만 남긴다. */
export function arenaTournamentBracketOverview(
  bracket: ArenaTournamentBracket,
): ArenaTournamentBracket {
  return {
    ...bracket,
    participants: bracket.participants.map((participant) =>
      arenaTournamentParticipantForPublic(bracket, participant),
    ),
    matches: bracket.matches.map((match) => ({
      ...match,
      games: match.games.map(({ replay, ...game }) => ({
        ...game,
        hasReplay: Boolean(replay) || game.hasReplay === true,
      })),
    })),
  };
}

export const ARENA_TOURNAMENT_DISHONORED_NAME = "불명예 처리된 참가자";

export function isArenaTournamentParticipantDishonored(
  bracket: ArenaTournamentBracket,
  userId: string | null | undefined,
): boolean {
  return Boolean(
    userId &&
      Array.isArray(bracket.dishonoredUserIds) &&
      bracket.dishonoredUserIds.includes(userId),
  );
}

export function arenaTournamentParticipantForPublic(
  bracket: ArenaTournamentBracket,
  participant: ArenaTournamentParticipant,
): ArenaTournamentParticipant {
  if (!isArenaTournamentParticipantDishonored(bracket, participant.userId)) {
    return participant;
  }
  const { avatar: _avatar, ...publicParticipant } = participant;
  return {
    ...publicParticipant,
    name: ARENA_TOURNAMENT_DISHONORED_NAME,
    dishonored: true,
  };
}

function replaceAllLiteral(value: string, search: string, replacement: string): string {
  return search ? value.split(search).join(replacement) : value;
}

export function arenaTournamentReplayForPublic(
  bracket: ArenaTournamentBracket,
  replay: ReplayPayload,
): ReplayPayload {
  const hiddenNames = bracket.participants
    .filter((participant) =>
      isArenaTournamentParticipantDishonored(bracket, participant.userId),
    )
    .map((participant) => participant.name)
    .filter(Boolean);
  if (hiddenNames.length === 0) return replay;
  const redact = (value: string) =>
    hiddenNames.reduce(
      (next, name) =>
        replaceAllLiteral(next, name, ARENA_TOURNAMENT_DISHONORED_NAME),
      value,
    );
  return {
    ...replay,
    enemy: { ...replay.enemy, name: redact(replay.enemy.name) },
    log: replay.log.map((entry) => ({ ...entry, text: redact(entry.text) })),
  };
}

export function arenaTournamentMatchNoticeText(
  bracket: ArenaTournamentBracket,
  match: ArenaTournamentMatch,
): string {
  const participantById = new Map(
    bracket.participants.map((participant) => [participant.userId, participant]),
  );
  const p1Name = participantById.get(match.p1UserId ?? "")?.name ?? "참가자";
  const p2Name = participantById.get(match.p2UserId ?? "")?.name ?? "참가자";
  const winnerName =
    participantById.get(match.winnerUserId ?? "")?.name ?? "승리자";
  const score = `${p1Name} ${match.p1Wins}:${match.p2Wins} ${p2Name}`;
  if (match.kind === "final") {
    return `🏆 결승 · ${score} — ${winnerName}님이 챔피언이 되었습니다.`;
  }
  const icon =
    match.kind === "third_place"
      ? "🥉"
      : match.roundName === "준결승"
        ? "🔥"
        : "🏟️";
  return `${icon} ${match.roundName} · ${score} — ${winnerName} 승리`;
}

export function arenaTournamentRewardFor(args: {
  placement?: 1 | 2 | 3 | 4;
  eliminatedRound: number | undefined;
  totalRounds: number;
}): { placement: string; coins: number } {
  if (args.placement === 1) return { placement: "1위", coins: 600 };
  if (args.placement === 2) return { placement: "2위", coins: 400 };
  if (args.placement === 3) return { placement: "3위", coins: 300 };
  if (args.placement === 4) return { placement: "4위", coins: 200 };
  if (args.eliminatedRound === args.totalRounds - 2) {
    return { placement: "8강", coins: 150 };
  }
  return { placement: "본선 진출", coins: 100 };
}

export function resolveArenaTournamentScheduledMatch<T>(args: {
  bracket: ArenaTournamentBracket;
  matchId: string;
  entrants: readonly ArenaTournamentEntrant<T>[];
  fight: (
    p1: ArenaTournamentEntrant<T>,
    p2: ArenaTournamentEntrant<T>,
    game: number,
  ) => ArenaTournamentFightResult;
}): ArenaTournamentBracket {
  const target = args.bracket.matches.find((match) => match.id === args.matchId);
  if (!target || target.status !== "scheduled") return args.bracket;
  if (!target.p1UserId || !target.p2UserId) {
    throw new Error(`arena tournament match ${args.matchId} has no participants`);
  }
  const entrantById = new Map(
    args.entrants.map((entrant) => [entrant.participant.userId, entrant]),
  );
  const p1 = entrantById.get(target.p1UserId);
  const p2 = entrantById.get(target.p2UserId);
  if (!p1 || !p2) {
    throw new Error(`arena tournament match ${args.matchId} snapshot missing`);
  }
  const resolved = resolveMatch({ match: target, p1, p2, fight: args.fight });
  const matches = args.bracket.matches.map((match) => {
    if (match.id === target.id) return resolved;
    if (match.status !== "scheduled") return match;
    if (match.p1SourceMatchId === target.id) {
      return {
        ...match,
        p1UserId:
          match.p1SourceResult === "loser"
            ? resolved.loserUserId
            : resolved.winnerUserId,
      };
    }
    if (match.p2SourceMatchId === target.id) {
      return {
        ...match,
        p2UserId:
          match.p2SourceResult === "loser"
            ? resolved.loserUserId
            : resolved.winnerUserId,
      };
    }
    return match;
  });
  const completed = matches.every((match) => match.status === "completed");
  if (!completed) {
    return { ...args.bracket, status: "in_progress", matches };
  }

  const final = matches.find((match) => match.kind === "final")!;
  const thirdPlace = matches.find((match) => match.kind === "third_place")!;
  const championUserId = final.winnerUserId;
  const placementByUserId = new Map<string, 1 | 2 | 3 | 4>([
    [final.winnerUserId!, 1],
    [final.loserUserId!, 2],
    [thirdPlace.winnerUserId!, 3],
    [thirdPlace.loserUserId!, 4],
  ]);
  const eliminatedRound = new Map(
    matches
      .filter((match) => match.kind === "elimination" && match.loserUserId)
      .map((match) => [match.loserUserId!, match.round]),
  );
  const totalRounds = Math.log2(args.bracket.bracketSize);
  return {
    ...args.bracket,
    status: "completed",
    matches,
    championUserId,
    rewards: args.bracket.participants.map((participant) => ({
      userId: participant.userId,
      ...arenaTournamentRewardFor({
        placement: placementByUserId.get(participant.userId),
        eliminatedRound: eliminatedRound.get(participant.userId),
        totalRounds,
      }),
    })),
  };
}

export function nextDueArenaTournamentMatch(
  bracket: ArenaTournamentBracket,
  now: Date,
): ArenaTournamentMatch | null {
  return (
    bracket.matches.find(
      (match) =>
        match.status === "scheduled" &&
        match.p1UserId != null &&
        match.p2UserId != null &&
        new Date(match.scheduledAt).getTime() <= now.getTime(),
    ) ?? null
  );
}
