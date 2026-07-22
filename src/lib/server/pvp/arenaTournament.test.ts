import { describe, expect, it } from "vitest";
import {
  ARENA_TOURNAMENT_MIN_MATCHES,
  arenaRankedEndsAt,
  arenaSeasonPhase,
  arenaTournamentBracketSize,
  arenaTournamentFirstRoundPairs,
  resolveArenaTournament,
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

  it("시즌 종료 24시간 전부터 일요일 토너먼트 단계가 된다", () => {
    expect(arenaRankedEndsAt(endAt).toISOString()).toBe(
      "2026-07-25T15:00:00.000Z",
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

describe("arena tournament bracket", () => {
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

  it("8강 3판 2선승 토너먼트를 끝까지 계산하고 단계별 보상을 만든다", () => {
    const bracket = resolveArenaTournament({
      seasonId: "2026-W30",
      generatedAt: new Date("2026-07-26T00:00:00.000Z"),
      entrants: entrants(8),
      rng: () => 0.5,
      fight: () => ({
        outcome: "p1_win",
        turns: 10,
        p1HpRatio: 0.5,
        p2HpRatio: 0,
      }),
    });

    expect(bracket.status).toBe("completed");
    expect(bracket.bracketSize).toBe(8);
    expect(bracket.matches).toHaveLength(7);
    expect(bracket.matches.every((match) => match.games.length === 2)).toBe(true);
    expect(bracket.championUserId).toBeTruthy();
    expect(bracket.rewards.find((reward) => reward.coins === 600)?.placement).toBe(
      "우승",
    );
    expect(bracket.rewards.filter((reward) => reward.coins === 400)).toHaveLength(
      1,
    );
    expect(bracket.rewards.filter((reward) => reward.coins === 250)).toHaveLength(
      2,
    );
    expect(bracket.rewards.filter((reward) => reward.coins === 150)).toHaveLength(
      4,
    );
  });

  it("승수가 같으면 HP 비율, 그것도 같으면 예선 상위 순위로 결정한다", () => {
    const hpBracket = resolveArenaTournament({
      seasonId: "hp",
      generatedAt: new Date(0),
      entrants: entrants(8),
      rng: () => 0.5,
      fight: () => ({
        outcome: "draw",
        turns: 100,
        p1HpRatio: 0.6,
        p2HpRatio: 0.4,
      }),
    });
    expect(hpBracket.matches[0]?.decidedBy).toBe("hp");
    expect(hpBracket.matches[0]?.games).toHaveLength(5);

    const seedBracket = resolveArenaTournament({
      seasonId: "seed",
      generatedAt: new Date(0),
      entrants: entrants(8),
      rng: () => 0.5,
      fight: () => ({
        outcome: "draw",
        turns: 100,
        p1HpRatio: 0.5,
        p2HpRatio: 0.5,
      }),
    });
    expect(seedBracket.matches[0]?.decidedBy).toBe("seed");
    const first = seedBracket.matches[0]!;
    const winner = seedBracket.participants.find(
      (participant) => participant.userId === first.winnerUserId,
    )!;
    const loser = seedBracket.participants.find(
      (participant) => participant.userId === first.loserUserId,
    )!;
    expect(winner.qualifyingRank).toBeLessThan(loser.qualifyingRank);
  });

  it("8명 미만이면 토너먼트를 열지 않는다", () => {
    const bracket = resolveArenaTournament({
      seasonId: "small",
      generatedAt: new Date(0),
      entrants: entrants(7),
      fight: () => {
        throw new Error("fight must not run");
      },
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
