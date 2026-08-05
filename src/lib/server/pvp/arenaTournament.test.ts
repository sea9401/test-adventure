import { describe, expect, it } from "vitest";
import {
  ARENA_TOURNAMENT_BET_FEE_BPS,
  ARENA_TOURNAMENT_BET_MAX_GOLD,
  ARENA_TOURNAMENT_BET_SEASON_MAX_GOLD,
  ARENA_TOURNAMENT_ROUND_INTERVAL_MS,
  ARENA_TOURNAMENT_MIN_MATCHES,
  arenaTournamentBracketOverview,
  arenaRankedEndsAt,
  arenaSeasonPhase,
  arenaTournamentBetPayouts,
  arenaTournamentBracketSize,
  arenaTournamentFirstRoundPairs,
  arenaTournamentSnapshotsAt,
  arenaTournamentStartsAt,
  arenaTournamentMatchNoticeText,
  createArenaTournamentSchedule,
  nextDueArenaTournamentMatch,
  resolveArenaTournamentScheduledMatch,
  stripArenaTournamentReplays,
  type ArenaTournamentEntrant,
} from "./arenaTournament";

function entrants(count: number): ArenaTournamentEntrant<{ seed: number }>[] {
  return Array.from({ length: count }, (_, index) => {
    const rank = index + 1;
    return {
      participant: {
        userId: `u-${rank}`,
        name: `참가자 ${rank}`,
        level: 100,
        qualifyingRank: rank,
        rating: 1500 - rank,
        matches: ARENA_TOURNAMENT_MIN_MATCHES,
      },
      payload: { seed: rank },
    };
  });
}

describe("arena tournament phase", () => {
  const endAt = new Date("2026-07-26T15:00:00.000Z");

  it("일요일 00시에 예선을 닫고 19시에 챔피언십을 시작한다", () => {
    expect(arenaRankedEndsAt(endAt).toISOString()).toBe(
      "2026-07-25T15:00:00.000Z",
    );
    expect(arenaTournamentStartsAt(endAt).toISOString()).toBe(
      "2026-07-26T10:00:00.000Z",
    );
    expect(arenaTournamentSnapshotsAt(endAt).toISOString()).toBe(
      "2026-07-26T09:00:00.000Z",
    );
    expect(arenaSeasonPhase(endAt, new Date("2026-07-25T14:59:59.999Z"))).toBe(
      "ranked",
    );
    expect(arenaSeasonPhase(endAt, new Date("2026-07-25T15:00:00.000Z"))).toBe(
      "tournament",
    );
    expect(arenaSeasonPhase(endAt, endAt)).toBe("closed");
  });
});

describe("arena tournament replay retention", () => {
  it("30일 뒤 전투 요약은 남기고 리플레이만 제거한다", () => {
    const scheduled = createArenaTournamentSchedule({
      seasonId: "2026-W30",
      generatedAt: new Date("2026-07-25T15:00:00.000Z"),
      startsAt: new Date("2026-07-26T10:00:00.000Z"),
      entrants: entrants(8),
    });
    const first = scheduled.matches[0]!;
    const bracket = {
      ...scheduled,
      matches: [
        {
          ...first,
          games: [
            {
              game: 1,
              outcome: "p1_win" as const,
              turns: 12,
              p1HpRatio: 0.5,
              p2HpRatio: 0,
              replay: {
                enemy: { name: "상대", hp: 100 },
                playerMaxHp: 100,
                playerMaxMp: 0,
                log: [],
              },
            },
          ],
        },
        ...scheduled.matches.slice(1),
      ],
    };

    const trimmed = stripArenaTournamentReplays(bracket);
    expect(trimmed.removed).toBe(1);
    expect(trimmed.bracket.matches[0]!.games[0]!.replay).toBeUndefined();
    expect(trimmed.bracket.matches[0]!.games[0]).toMatchObject({
      outcome: "p1_win",
      turns: 12,
      p1HpRatio: 0.5,
    });
    expect(bracket.matches[0]!.games[0]!.replay).toBeDefined();
  });
});

describe("arena tournament schedule", () => {
  it("참가 인원에 따라 최대 32강에서 8·16·32강으로 축소한다", () => {
    expect(arenaTournamentBracketSize(7)).toBe(0);
    expect(arenaTournamentBracketSize(8)).toBe(8);
    expect(arenaTournamentBracketSize(15)).toBe(8);
    expect(arenaTournamentBracketSize(16)).toBe(16);
    expect(arenaTournamentBracketSize(31)).toBe(16);
    expect(arenaTournamentBracketSize(40)).toBe(32);
  });

  it("첫 라운드는 1·4포트와 2·3포트끼리 만난다", () => {
    const pairs = arenaTournamentFirstRoundPairs(entrants(32), () => 0.5);
    expect(pairs).toHaveLength(16);
    for (let i = 0; i < pairs.length; i += 2) {
      const [high, low] = pairs[i]!;
      expect(high.participant.qualifyingRank).toBeLessThanOrEqual(8);
      expect(low.participant.qualifyingRank).toBeGreaterThanOrEqual(25);
      const [middleHigh, middleLow] = pairs[i + 1]!;
      expect(middleHigh.participant.qualifyingRank).toBeGreaterThanOrEqual(9);
      expect(middleHigh.participant.qualifyingRank).toBeLessThanOrEqual(16);
      expect(middleLow.participant.qualifyingRank).toBeGreaterThanOrEqual(17);
      expect(middleLow.participant.qualifyingRank).toBeLessThanOrEqual(24);
    }
  });

  it("같은 라운드는 동시에, 다음 라운드는 15분 뒤로 예약한다", () => {
    const startsAt = new Date("2026-07-26T10:00:00.000Z");
    const bracket = createArenaTournamentSchedule({
      seasonId: "2026-W30",
      generatedAt: new Date("2026-07-25T15:00:00.000Z"),
      startsAt,
      entrants: entrants(8),
      rng: () => 0.5,
    });
    expect(bracket.status).toBe("scheduled");
    expect(bracket.matches).toHaveLength(8);
    expect(bracket.matches[0]?.p1UserId).toBeTruthy();
    expect(bracket.matches[4]?.p1UserId).toBeNull();
    expect(bracket.matches.slice(0, 4).map((match) => match.scheduledAt)).toEqual(
      Array(4).fill(startsAt.toISOString()),
    );
    expect(
      new Date(bracket.matches[7]!.scheduledAt).getTime() - startsAt.getTime(),
    ).toBe(3 * ARENA_TOURNAMENT_ROUND_INTERVAL_MS);
    expect(bracket.matches.slice(-2).map((match) => match.roundName)).toEqual([
      "3·4위전",
      "결승",
    ]);
    expect(nextDueArenaTournamentMatch(bracket, startsAt)?.sequence).toBe(1);
  });

  it("32강은 20시에 3·4위전, 20시 15분에 결승을 예약한다", () => {
    const startsAt = new Date("2026-07-26T10:00:00.000Z");
    const bracket = createArenaTournamentSchedule({
      seasonId: "2026-W30",
      generatedAt: new Date("2026-07-25T15:00:00.000Z"),
      startsAt,
      entrants: entrants(32),
      rng: () => 0.5,
    });
    expect(bracket.matches).toHaveLength(32);
    expect(bracket.matches.at(-2)).toMatchObject({
      kind: "third_place",
      roundName: "3·4위전",
      sequence: 31,
      scheduledAt: "2026-07-26T11:00:00.000Z",
    });
    expect(bracket.matches.at(-1)).toMatchObject({
      kind: "final",
      roundName: "결승",
      sequence: 32,
      scheduledAt: "2026-07-26T11:15:00.000Z",
    });
  });

  it("예약된 경기를 순서대로 진행하고 마지막 경기에서 보상을 확정한다", () => {
    let bracket = createArenaTournamentSchedule({
      seasonId: "2026-W30",
      generatedAt: new Date(0),
      startsAt: new Date(0),
      entrants: entrants(8),
      rng: () => 0.5,
    });
    for (const scheduled of [...bracket.matches]) {
      bracket = resolveArenaTournamentScheduledMatch({
        bracket,
        matchId: scheduled.id,
        entrants: entrants(8),
        fight: () => ({
          outcome: "p1_win",
          turns: 10,
          p1HpRatio: 0.5,
          p2HpRatio: 0,
        }),
      });
    }

    expect(bracket.status).toBe("completed");
    expect(bracket.matches.every((match) => match.games.length === 2)).toBe(true);
    expect(bracket.championUserId).toBeTruthy();
    expect(bracket.rewards.find((reward) => reward.coins === 600)?.placement).toBe("1위");
    expect(bracket.rewards.filter((reward) => reward.coins === 400)).toHaveLength(
      1,
    );
    expect(bracket.rewards.find((reward) => reward.coins === 300)?.placement).toBe("3위");
    expect(bracket.rewards.find((reward) => reward.coins === 200)?.placement).toBe("4위");
    expect(bracket.rewards.filter((reward) => reward.coins === 150)).toHaveLength(
      4,
    );
  });

  it("경기별 리플레이는 저장하고 목록용 대진표에서는 존재 여부만 남긴다", () => {
    const original = createArenaTournamentSchedule({
      seasonId: "2026-W31",
      generatedAt: new Date(0),
      startsAt: new Date(0),
      entrants: entrants(8),
      rng: () => 0.5,
    });
    const replay = {
      enemy: { name: "참가자 8", hp: 100 },
      playerMaxHp: 100,
      playerMaxMp: 0,
      log: [{ kind: "info" as const, text: "테스트 전투" }],
    };
    const bracket = resolveArenaTournamentScheduledMatch({
      bracket: original,
      matchId: original.matches[0]!.id,
      entrants: entrants(8),
      fight: () => ({
        outcome: "p1_win",
        turns: 10,
        p1HpRatio: 0.5,
        p2HpRatio: 0,
        replay,
      }),
    });
    const match = bracket.matches[0]!;
    expect(match.games[0]?.replay).toEqual(replay);
    expect(arenaTournamentMatchNoticeText(bracket, match)).toContain(
      `${match.p1Wins}:${match.p2Wins}`,
    );

    const overview = arenaTournamentBracketOverview(bracket);
    expect(overview.matches[0]?.games[0]?.replay).toBeUndefined();
    expect(overview.matches[0]?.games[0]?.hasReplay).toBe(true);
  });

  it("승수가 같으면 HP 비율, 그것도 같으면 예선 상위 순위로 결정한다", () => {
    const original = createArenaTournamentSchedule({
      seasonId: "tie",
      generatedAt: new Date(0),
      startsAt: new Date(0),
      entrants: entrants(8),
      rng: () => 0.5,
    });
    const firstId = original.matches[0]!.id;
    const hpBracket = resolveArenaTournamentScheduledMatch({
      bracket: original,
      matchId: firstId,
      entrants: entrants(8),
      fight: () => ({
        outcome: "draw",
        turns: 100,
        p1HpRatio: 0.6,
        p2HpRatio: 0.4,
      }),
    });
    expect(hpBracket.matches[0]?.decidedBy).toBe("hp");
    expect(hpBracket.matches[0]?.games).toHaveLength(5);

    const seedBracket = resolveArenaTournamentScheduledMatch({
      bracket: original,
      matchId: firstId,
      entrants: entrants(8),
      fight: () => ({
        outcome: "draw",
        turns: 100,
        p1HpRatio: 0.5,
        p2HpRatio: 0.5,
      }),
    });
    expect(seedBracket.matches[0]?.decidedBy).toBe("seed");
    const match = seedBracket.matches[0]!;
    const winner = seedBracket.participants.find(
      (participant) => participant.userId === match.winnerUserId,
    )!;
    const loser = seedBracket.participants.find(
      (participant) => participant.userId === match.loserUserId,
    )!;
    expect(winner.qualifyingRank).toBeLessThan(loser.qualifyingRank);
  });

  it("8명 미만이면 토너먼트를 열지 않는다", () => {
    const bracket = createArenaTournamentSchedule({
      seasonId: "small",
      generatedAt: new Date(0),
      startsAt: new Date(0),
      entrants: entrants(7),
    });
    expect(bracket).toMatchObject({
      status: "not_enough_players",
      bracketSize: 0,
      championUserId: null,
      matches: [],
      rewards: [],
    });
  });
});

describe("arena tournament pool betting", () => {
  it("경기당 150만, 주간 600만 골드까지 베팅할 수 있다", () => {
    expect(ARENA_TOURNAMENT_BET_MAX_GOLD).toBe(1_500_000);
    expect(ARENA_TOURNAMENT_BET_SEASON_MAX_GOLD).toBe(6_000_000);
    expect(ARENA_TOURNAMENT_BET_SEASON_MAX_GOLD).toBe(
      ARENA_TOURNAMENT_BET_MAX_GOLD * 4,
    );
  });

  it("패배 풀에서 5%를 회수하고 승리 선택자에게 베팅 비율대로 분배한다", () => {
    const result = arenaTournamentBetPayouts({
      winnerUserId: "p1",
      feeBps: ARENA_TOURNAMENT_BET_FEE_BPS,
      bets: [
        { userId: "a", chosenUserId: "p1", amount: 1_000 },
        { userId: "b", chosenUserId: "p1", amount: 3_000 },
        { userId: "c", chosenUserId: "p2", amount: 2_000 },
      ],
    });
    expect(result.totalPool).toBe(6_000);
    expect(result.fee).toBe(100);
    expect(result.payouts).toEqual([
      { userId: "a", amount: 1_475, status: "won" },
      { userId: "b", amount: 4_425, status: "won" },
      { userId: "c", amount: 0, status: "lost" },
    ]);
  });

  it("승리자를 고른 사람이 없으면 전액 환불한다", () => {
    const result = arenaTournamentBetPayouts({
      winnerUserId: "p1",
      bets: [
        { userId: "a", chosenUserId: "p2", amount: 1_000 },
        { userId: "b", chosenUserId: "p2", amount: 2_000 },
      ],
    });
    expect(result.refunded).toBe(true);
    expect(result.fee).toBe(0);
    expect(result.payouts.map((payout) => payout.amount)).toEqual([1_000, 2_000]);
  });
});
