import { describe, expect, it } from "vitest";
import {
  applyGuildRaidDamage,
  guildRaidCombatEndsAt,
  guildRaidMaxHp,
  guildRaidPhase,
  guildRaidRewardFor,
  guildRaidRewardForRank,
  isGuildRaidParticipantEligible,
  normalizeGuildRaidPage,
  parseGuildRaidRewardTier,
  rankGuildRaidScores,
  rankGuildRaidScoresByBoss,
  resolveGuildRaidRewardTier,
} from "./guildRaid";
import { GUILD_RAID_BOSSES } from "./guildRaidBosses";

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

describe("길드 토벌전 보스별 단계 체력", () => {
  it("산군은 120만에서 시작해 단계마다 1.25배로 늘어난다", () => {
    expect(guildRaidMaxHp("mountain_chief_hard", 1)).toBe(1_200_000);
    expect(guildRaidMaxHp("mountain_chief_hard", 2)).toBe(1_500_000);
  });

  it("토벌 스콜피온은 자기 단계 기준 체력에서 시작한다", () => {
    const base = GUILD_RAID_BOSSES.canyon_predator_raid.stageBaseHp;
    expect(guildRaidMaxHp("canyon_predator_raid", 1)).toBe(base);
    expect(guildRaidMaxHp("canyon_predator_raid", 2)).toBe(
      Math.floor(base * 1.25),
    );
  });
});

describe("길드 토벌전 보상 구간", () => {
  const threshold =
    GUILD_RAID_BOSSES.canyon_predator_raid.bonusMinGuildDamage ?? 0;

  it("산군은 피해와 상관없이 기본 구간이다", () => {
    expect(resolveGuildRaidRewardTier("mountain_chief_hard", 0)).toBe(
      "standard",
    );
  });

  it("토벌 스콜피온은 기준 이상이면 2배, 미달이면 최하 구간이다", () => {
    expect(resolveGuildRaidRewardTier("canyon_predator_raid", threshold)).toBe(
      "bonus",
    );
    expect(
      resolveGuildRaidRewardTier("canyon_predator_raid", threshold - 1),
    ).toBe("floor");
  });

  it("구간별 개인 보상을 계산한다", () => {
    expect(guildRaidRewardFor(2, "standard")).toEqual({
      gold: 3_000_000,
      masteryCertificates: 300,
    });
    expect(guildRaidRewardFor(1, "bonus")).toEqual({
      gold: 10_000_000,
      masteryCertificates: 1_000,
    });
    expect(guildRaidRewardFor(1, "floor")).toEqual({
      gold: 500_000,
      masteryCertificates: 50,
    });
  });

  it("저장된 구간이 없거나 알 수 없으면 기본 구간으로 해석한다", () => {
    expect(parseGuildRaidRewardTier(null)).toBe("standard");
    expect(parseGuildRaidRewardTier("weird")).toBe("standard");
    expect(parseGuildRaidRewardTier("bonus")).toBe("bonus");
    expect(parseGuildRaidRewardTier("floor")).toBe("floor");
  });
});

describe("길드 토벌전 보스별 순위", () => {
  it("같은 보스를 고른 길드끼리만 순위를 매긴다", () => {
    const ranked = rankGuildRaidScoresByBoss([
      { guildId: 1, damage: 100, bossKind: "mountain_chief_hard" as const },
      { guildId: 2, damage: 50, bossKind: "mountain_chief_hard" as const },
      { guildId: 3, damage: 10, bossKind: "canyon_predator_raid" as const },
    ]);
    const rankOf = (guildId: number) =>
      ranked.find((row) => row.guildId === guildId)?.rank;
    expect(rankOf(1)).toBe(1);
    expect(rankOf(2)).toBe(2);
    expect(rankOf(3)).toBe(1);
  });
});
