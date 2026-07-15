import { describe, expect, it } from "vitest";
import {
  consumeGuildDiningEffectState,
  GUILD_DINING_INGREDIENTS,
  guildDiningDonationPoints,
  guildDiningPantryTarget,
  guildDiningTicketProgress,
  parseGuildDiningUserState,
} from "./guildDining";

describe("guild dining", () => {
  it("식재료 ID는 공급원과 원본 아이템 ID를 분리한다", () => {
    const wheat = GUILD_DINING_INGREDIENTS.find((item) => item.id === "farm:wheat");
    expect(wheat).toMatchObject({
      source: "farm",
      sourceItemId: "wheat",
      batchSize: 1,
      pointValue: 1,
    });
    expect(GUILD_DINING_INGREDIENTS.some((item) => item.sourceItemId === "herb")).toBe(false);
  });

  it("낚시 어획물은 등급별 묶음 단위로 공동 준비 점수를 계산한다", () => {
    const common = GUILD_DINING_INGREDIENTS.find(
      (item) => item.id === "fishing_item:catch_common",
    );
    const legendary = GUILD_DINING_INGREDIENTS.find(
      (item) => item.id === "fishing_item:catch_legendary",
    );
    expect(common).toMatchObject({ batchSize: 5, pointValue: 1 });
    expect(legendary).toMatchObject({ batchSize: 1, pointValue: 8 });
    expect(guildDiningDonationPoints(common!, 10)).toBe(2);
    expect(guildDiningDonationPoints(common!, 6)).toBeNull();
    expect(guildDiningDonationPoints(legendary!, 1)).toBe(8);
  });

  it("길드를 옮겨도 같은 주의 사용 식권과 음식 효과는 유지한다", () => {
    const state = parseGuildDiningUserState(
      {
        weekKey: "2026-07-13",
        guildId: 1,
        contributionPoints: 30,
        mealsUsed: 1,
        activeEffect: {
          menuId: "adventurer_meal",
          kind: "hunt_exp",
          remainingUses: 5,
          roundingRemainder: 20,
        },
      },
      { weekKey: "2026-07-13", guildId: 2 },
    );
    expect(state.contributionPoints).toBe(0);
    expect(state.mealsUsed).toBe(1);
    expect(state.activeEffect?.remainingUses).toBe(5);
  });

  it("기여 15점마다 식권을 주되 시설 한도를 넘지 않는다", () => {
    const state = parseGuildDiningUserState(
      { weekKey: "2026-07-13", guildId: 1, contributionPoints: 100, mealsUsed: 1 },
      { weekKey: "2026-07-13", guildId: 1 },
    );
    expect(guildDiningTicketProgress(state, 3)).toEqual({
      earned: 3,
      used: 1,
      available: 2,
      contributionCap: 45,
    });
  });

  it("소수 보너스를 누적해 1점 활동 20회에도 정확히 5%를 지급한다", () => {
    let state = parseGuildDiningUserState(
      {
        weekKey: "2026-07-13",
        guildId: 1,
        activeEffect: {
          menuId: "worker_lunch",
          kind: "life_xp",
          remainingUses: 20,
        },
      },
      { weekKey: "2026-07-13", guildId: 1 },
    );
    let bonus = 0;
    for (let i = 0; i < 20; i += 1) {
      const consumed = consumeGuildDiningEffectState(state, "life_xp", 1);
      state = consumed.state;
      bonus += consumed.bonus;
    }
    expect(bonus).toBe(1);
    expect(state.activeEffect).toBeNull();
  });

  it("공동 준비 목표는 인원에 비례하며 상한이 있다", () => {
    expect(guildDiningPantryTarget(1)).toBe(20);
    expect(guildDiningPantryTarget(3)).toBe(60);
    expect(guildDiningPantryTarget(999)).toBe(400);
  });
});
