import { describe, expect, it } from "vitest";
import {
  activeEffectForMenu,
  consumeGuildDiningEffectState,
  GUILD_DINING_EFFECT_DURATION_MS,
  GUILD_DINING_INGREDIENTS,
  GUILD_DINING_MENUS,
  guildDiningDonationPoints,
  guildDiningMenu,
  guildDiningPantryTarget,
  guildDiningTicketProgress,
  parseGuildDiningUserState,
} from "./guildDining";

describe("guild dining", () => {
  const now = new Date("2026-07-15T00:00:00.000Z");

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
          expiresAt: now.getTime() + 60_000,
          roundingRemainder: 20,
        },
      },
      { weekKey: "2026-07-13", guildId: 2, now },
    );
    expect(state.contributionPoints).toBe(0);
    expect(state.mealsUsed).toBe(1);
    expect(state.activeEffect?.expiresAt).toBe(now.getTime() + 60_000);
  });

  it("모든 길드원에게 기본 식권을 주고 기여 15점마다 추가 지급한다", () => {
    const state = parseGuildDiningUserState(
      { weekKey: "2026-07-13", guildId: 1, contributionPoints: 100, mealsUsed: 1 },
      { weekKey: "2026-07-13", guildId: 1 },
    );
    expect(guildDiningTicketProgress(state, 3)).toEqual({
      base: 1,
      contributionEarned: 3,
      earned: 4,
      used: 1,
      available: 3,
      contributionCap: 45,
    });
    expect(
      guildDiningTicketProgress(
        parseGuildDiningUserState(
          { weekKey: "2026-07-13", guildId: 1 },
          { weekKey: "2026-07-13", guildId: 1 },
        ),
        3,
      ),
    ).toMatchObject({
      base: 1,
      contributionEarned: 0,
      earned: 1,
      available: 1,
    });
  });

  it("Lv3부터 Lv5까지 단계마다 신규 메뉴를 연다", () => {
    expect(
      GUILD_DINING_MENUS.map((menu) => [menu.id, menu.minFacilityLevel]),
    ).toEqual([
      ["hearty_stew", 1],
      ["adventurer_meal", 1],
      ["worker_lunch", 2],
      ["hunters_barbecue", 3],
      ["artisan_seafood_rice", 4],
      ["guild_grand_feast", 5],
    ]);
  });

  it("메뉴별 회복량과 경험치 보너스를 적용한다", () => {
    expect(
      GUILD_DINING_MENUS.map((menu) => [menu.id, menu.effect]),
    ).toEqual([
      ["hearty_stew", { kind: "recovery", hp: 250_000, mp: 250_000 }],
      ["adventurer_meal", { kind: "hunt_exp", bonusPct: 25, durationHours: 12 }],
      ["worker_lunch", { kind: "life_xp", bonusPct: 10, durationHours: 12 }],
      ["hunters_barbecue", { kind: "hunt_exp", bonusPct: 40, durationHours: 12 }],
      ["artisan_seafood_rice", { kind: "life_xp", bonusPct: 15, durationHours: 12 }],
      ["guild_grand_feast", { kind: "all_xp", bonusPct: 60, lifeBonusPct: 20, durationHours: 12 }],
    ]);
  });

  it("12시간 동안 횟수 제한 없이 소수 보너스를 정확히 누적한다", () => {
    let state = parseGuildDiningUserState(
      {
        weekKey: "2026-07-13",
        guildId: 1,
        activeEffect: {
          menuId: "worker_lunch",
          kind: "life_xp",
          expiresAt: now.getTime() + GUILD_DINING_EFFECT_DURATION_MS,
        },
      },
      { weekKey: "2026-07-13", guildId: 1, now },
    );
    let bonus = 0;
    for (let i = 0; i < 20; i += 1) {
      const consumed = consumeGuildDiningEffectState(state, "life_xp", 1, now);
      state = consumed.state;
      bonus += consumed.bonus;
    }
    expect(bonus).toBe(2);
    expect(state.activeEffect?.expiresAt).toBe(
      now.getTime() + GUILD_DINING_EFFECT_DURATION_MS,
    );
  });

  it("같은 메뉴는 남은 시간에 12시간을 더하고 다른 메뉴는 교체한다", () => {
    const adventurerMeal = guildDiningMenu("adventurer_meal")!;
    const workerLunch = guildDiningMenu("worker_lunch")!;
    const currentEffect = activeEffectForMenu(adventurerMeal, {
      currentEffect: null,
      now,
      weekKey: "2026-07-13",
    });
    const extended = activeEffectForMenu(adventurerMeal, {
      currentEffect,
      now,
      weekKey: "2026-07-13",
    });
    const replaced = activeEffectForMenu(workerLunch, {
      currentEffect,
      now,
      weekKey: "2026-07-13",
    });

    expect(extended?.expiresAt).toBe(
      now.getTime() + GUILD_DINING_EFFECT_DURATION_MS * 2,
    );
    expect(replaced).toMatchObject({
      menuId: "worker_lunch",
      kind: "life_xp",
      expiresAt: now.getTime() + GUILD_DINING_EFFECT_DURATION_MS,
    });
  });

  it("길드 대연회는 사냥과 생활 경험치에 모두 적용된다", () => {
    const grandFeast = guildDiningMenu("guild_grand_feast")!;
    const activeEffect = activeEffectForMenu(grandFeast, {
      currentEffect: null,
      now,
      weekKey: "2026-07-13",
    });
    let state = parseGuildDiningUserState(
      {
        weekKey: "2026-07-13",
        guildId: 1,
        activeEffect,
      },
      { weekKey: "2026-07-13", guildId: 1, now },
    );

    const hunt = consumeGuildDiningEffectState(state, "hunt_exp", 1_000, now);
    state = hunt.state;
    const life = consumeGuildDiningEffectState(state, "life_xp", 500, now);

    expect(hunt.bonus).toBe(600);
    expect(life.bonus).toBe(100);
    expect(life.state.activeEffect?.kind).toBe("all_xp");
  });

  it("만료된 효과는 적용하지 않는다", () => {
    const state = parseGuildDiningUserState(
      {
        weekKey: "2026-07-13",
        guildId: 1,
        activeEffect: {
          menuId: "adventurer_meal",
          kind: "hunt_exp",
          expiresAt: now.getTime(),
        },
      },
      { weekKey: "2026-07-13", guildId: 1, now },
    );

    expect(state.activeEffect).toBeNull();
  });

  it("기존 횟수형 효과는 남은 식권 손실 없이 12시간제로 승계한다", () => {
    const state = parseGuildDiningUserState(
      {
        weekKey: "2026-07-13",
        guildId: 1,
        activeEffect: {
          menuId: "adventurer_meal",
          kind: "hunt_exp",
          remainingUses: 5,
        },
      },
      { weekKey: "2026-07-13", guildId: 1, now },
    );

    expect(state.activeEffect?.expiresAt).toBe(
      now.getTime() + GUILD_DINING_EFFECT_DURATION_MS,
    );
  });

  it("공동 준비 목표는 인원에 비례하며 상한이 있다", () => {
    expect(guildDiningPantryTarget(1)).toBe(20);
    expect(guildDiningPantryTarget(3)).toBe(60);
    expect(guildDiningPantryTarget(999)).toBe(400);
  });
});
