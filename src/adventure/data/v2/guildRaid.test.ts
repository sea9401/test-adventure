import { describe, expect, it } from "vitest";
import {
  applyGuildRaidDamage,
  guildRaidCombatEndsAt,
  guildRaidPhase,
  guildRaidRewardForRank,
  isGuildRaidParticipantEligible,
  normalizeGuildRaidPage,
  rankGuildRaidScores,
} from "./guildRaid";

describe("길드 토벌전 주간 정책", () => {
  const startsAt = new Date("2026-08-30T15:00:00.000Z");
  const endsAt = new Date("2026-09-04T15:00:00.000Z");

  it("토요일 00:00 KST에 전투를 끝내고 월요일 직전까지만 수령한다", () => {
    expect(guildRaidCombatEndsAt(startsAt)).toEqual(endsAt);
    expect(
      guildRaidPhase(new Date("2026-09-04T14:59:59.999Z"), {
        startsAt,
        endsAt,
      }),
    ).toBe("active");
    expect(
      guildRaidPhase(new Date("2026-09-04T15:00:00.000Z"), {
        startsAt,
        endsAt,
      }),
    ).toBe("claim");
    expect(
      guildRaidPhase(new Date("2026-09-06T15:00:00.000Z"), {
        startsAt,
        endsAt,
      }),
    ).toBe("expired");
  });

  it.each([
    [1, 5_000_000, 500],
    [3, 3_000_000, 300],
    [10, 1_000_000, 100],
    [11, 500_000, 50],
  ])("%i위의 개인 보상을 확정한다", (rank, gold, masteryCertificates) => {
    expect(guildRaidRewardForRank(rank)).toEqual({
      gold,
      masteryCertificates,
    });
  });

  it("길드 순위와 최근 전투를 8개 단위의 마지막 유효 페이지로 보정한다", () => {
    expect(normalizeGuildRaidPage(9, 17)).toEqual({
      page: 3,
      pageSize: 8,
      totalPages: 3,
      offset: 16,
      limit: 8,
    });
    expect(normalizeGuildRaidPage("bad", 0)).toEqual({
      page: 1,
      pageSize: 8,
      totalPages: 1,
      offset: 0,
      limit: 8,
    });
  });
});

describe("길드 토벌전 단계 피해", () => {
  it("한 번의 피해를 처치한 모든 다음 단계에 이어서 적용한다", () => {
    expect(
      applyGuildRaidDamage(
        { stage: 1, hp: 100, maxHp: 100 },
        260,
        () => 150,
      ),
    ).toEqual({
      stage: 3,
      hp: 140,
      maxHp: 150,
      stagesCleared: 2,
    });
  });

  it("음수와 유한하지 않은 피해를 0으로 취급한다", () => {
    const state = { stage: 4, hp: 90, maxHp: 120 };
    expect(applyGuildRaidDamage(state, -1, () => 150)).toEqual({
      ...state,
      stagesCleared: 0,
    });
    expect(applyGuildRaidDamage(state, Number.POSITIVE_INFINITY, () => 150)).toEqual({
      ...state,
      stagesCleared: 0,
    });
  });
});

describe("길드 토벌전 참여 자격", () => {
  it("유효 공격 3회와 양수 피해를 모두 요구한다", () => {
    expect(isGuildRaidParticipantEligible(2, 999)).toBe(false);
    expect(isGuildRaidParticipantEligible(3, 0)).toBe(false);
    expect(isGuildRaidParticipantEligible(3, 1)).toBe(true);
  });
});

describe("길드 토벌전 순위", () => {
  it("동점 다음 순위를 건너뛰는 표준 경쟁 순위를 사용한다", () => {
    expect(
      rankGuildRaidScores([
        { guildId: 3, damage: 20 },
        { guildId: 2, damage: 50 },
        { guildId: 1, damage: 50 },
      ]),
    ).toEqual([
      { guildId: 1, damage: 50, rank: 1 },
      { guildId: 2, damage: 50, rank: 1 },
      { guildId: 3, damage: 20, rank: 3 },
    ]);
  });
});
