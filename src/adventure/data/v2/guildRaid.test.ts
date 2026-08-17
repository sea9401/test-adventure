import { describe, expect, it } from "vitest";
import {
  applyGuildRaidDamage,
  isGuildRaidParticipantEligible,
  rankGuildRaidScores,
} from "./guildRaid";

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
