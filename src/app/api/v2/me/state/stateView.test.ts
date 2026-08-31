import { describe, expect, it } from "vitest";
import {
  currentJobSummary,
  guildDiningEffectSummary,
  parseStateView,
  proficiencySummary,
} from "./stateView";

describe("parseStateView", () => {
  it.each([
    ["https://game.test/api/v2/me/state", "full"],
    ["https://game.test/api/v2/me/state?view=full", "full"],
    ["https://game.test/api/v2/me/state?view=core", "core"],
    ["https://game.test/api/v2/me/state?view=everything", null],
  ] as const)("%s의 조회 모드를 %s로 판정한다", (url, expected) => {
    expect(parseStateView(url)).toBe(expected);
  });
});

describe("core state summaries", () => {
  it("현재 직업은 전체 카탈로그 없이 ID·이름·티어만 반환한다", () => {
    expect(currentJobSummary({ class: "warrior" })).toEqual({
      currentJobId: "warrior",
      currentJobName: "견습 병사",
      currentJobTier: 1,
    });
  });

  it("숙련도는 현재 직업군의 티어와 현재 직업 누적치만 반환한다", () => {
    expect(
      proficiencySummary(
        {
          points: 5,
          groups: {
            warrior: { cultivations: 2, tier: 3, cumLevel: 42 },
            mage: { cultivations: 1, tier: 2, cumLevel: 17 },
          },
          caps: { str: 9 },
          grown: { str: 3 },
        },
        { class: "warrior" },
      ),
    ).toEqual({
      groups: { warrior: { tier: 3 } },
      current: { group: "warrior", cumLevel: 42 },
    });
  });
});

describe("길드 음식 상태 요약", () => {
  const now = new Date("2026-08-27T03:00:00.000Z");
  const args = { weekKey: "2026-08-24", guildId: 3, now };

  it("활성 효과를 캐릭터 요약용 이름과 보너스로 반환한다", () => {
    expect(
      guildDiningEffectSummary(
        {
          version: 1,
          weekKey: "2026-08-24",
          guildId: 3,
          contributionPoints: 20,
          mealsUsed: 1,
          activeEffect: {
            menuId: "guild_grand_feast",
            kind: "all_xp",
            bonusPct: 60,
            lifeBonusPct: 20,
            expiresAt: now.getTime() + 60 * 60_000,
            roundingRemainder: 0,
          },
        },
        args,
      ),
    ).toEqual({
      menuId: "guild_grand_feast",
      name: "길드 대연회",
      kind: "all_xp",
      bonusPct: 60,
      lifeBonusPct: 20,
      expiresAt: now.getTime() + 60 * 60_000,
    });
  });

  it("만료된 효과는 캐릭터 상태에서 제외한다", () => {
    expect(
      guildDiningEffectSummary(
        {
          version: 1,
          weekKey: "2026-08-24",
          guildId: 3,
          contributionPoints: 20,
          mealsUsed: 1,
          activeEffect: {
            menuId: "hunters_barbecue",
            kind: "hunt_exp",
            bonusPct: 40,
            expiresAt: now.getTime(),
            roundingRemainder: 0,
          },
        },
        args,
      ),
    ).toBeNull();
  });
});
