import { describe, expect, it } from "vitest";
import { cookingFoodDefinition, cookingFoodId } from "./food";
import { emptyCookingState } from "./state";
import {
  applyCookingDelivery,
  cookingDeliveryConditionText,
  cookingDeliveryScore,
  cookingRequests,
  cookingStandingDeliveryReward,
  type CookingDeliveryRequest,
} from "./delivery";

const NOW = Date.parse("2026-08-22T12:00:00+09:00");

function food(args: Parameters<typeof cookingFoodId>[0]) {
  return cookingFoodDefinition(cookingFoodId(args))!;
}

describe("condition cooking deliveries", () => {
  it.each([
    [{ field: "hearth", minimumQuality: "normal" }, "화덕 분야 · 일반 이상"],
    [{ method: "grill", minimumQuality: "normal" }, "굽기 조리 · 일반 이상"],
    [{ effectTag: "offense", minimumQuality: "careful" }, "공격 효과 · 정성작 이상"],
    [
      {
        field: "hearth",
        method: "grill",
        effectTag: "offense",
        minimumQuality: "masterpiece",
      },
      "화덕 분야 · 굽기 조리 · 공격 효과 · 걸작 이상",
    ],
  ] as const)("납품 조건 %j를 %s로 표시한다", (condition, expected) => {
    expect(cookingDeliveryConditionText(condition)).toBe(expected);
  });

  it("사용자와 날짜에 따라 일일 3건·주간 1건을 결정적으로 만든다", () => {
    const state = emptyCookingState(NOW);
    expect(cookingRequests("chef-a", state)).toEqual(cookingRequests("chef-a", state));
    expect(cookingRequests("chef-a", state).daily).toHaveLength(3);
    expect(cookingRequests("chef-a", state).weekly.kind).toBe("weekly");
    expect(new Set(cookingRequests("chef-a", state).daily.map((entry) => entry.id)).size).toBe(3);
  });

  it("조건을 만족하는 음식만 품질·티어·원조·전문 표식을 합산한다", () => {
    const request: CookingDeliveryRequest = {
      id: "test",
      kind: "daily",
      title: "화덕 공격식",
      targetScore: 100,
      condition: { field: "hearth", effectTag: "offense", minimumQuality: "normal" },
      rewards: { gold: 1, reputation: 1, cookingXp: 1, specialtyXp: 1 },
    };
    const normal = food({
      recipeId: "tomato_salad",
      quality: "normal",
      originator: false,
      specialtyBonusPct: 0,
    });
    const masterpiece = food({
      recipeId: "tomato_salad",
      quality: "masterpiece",
      originator: true,
      specialtyBonusPct: 5,
    });
    const wrong = food({
      recipeId: "fresh_fish_soup",
      quality: "masterpiece",
      originator: true,
      specialtyBonusPct: 5,
    });

    expect(cookingDeliveryScore(normal, request)).toBe(20);
    expect(cookingDeliveryScore(masterpiece, request)).toBe(42);
    expect(cookingDeliveryScore(wrong, request)).toBe(0);
  });

  it("여러 음식을 누적하고 목표를 처음 넘을 때만 보상을 준다", () => {
    const state = emptyCookingState(NOW);
    const request: CookingDeliveryRequest = {
      id: "daily-test",
      kind: "daily",
      title: "화덕식",
      targetScore: 40,
      condition: { field: "hearth", minimumQuality: "normal" },
      rewards: { gold: 5_000, reputation: 3, cookingXp: 40, specialtyXp: 20 },
    };
    const dish = food({
      recipeId: "tomato_salad",
      quality: "normal",
      originator: false,
      specialtyBonusPct: 0,
    });
    const first = applyCookingDelivery(state, request, dish, 1);
    expect(first.completedNow).toBe(false);
    expect(first.state.daily.requestScores[request.id]).toBe(20);
    const second = applyCookingDelivery(first.state, request, dish, 1);
    expect(second.completedNow).toBe(true);
    expect(second.rewards).toEqual(request.rewards);
    expect(() => applyCookingDelivery(second.state, request, dish, 1)).toThrow("delivery_completed");
  });

  it("상시 납품은 낮은 골드만 주고 수량 제한을 확인한다", () => {
    const dish = food({
      recipeId: "tomato_salad",
      quality: "careful",
      originator: false,
      specialtyBonusPct: 0,
    });
    expect(cookingStandingDeliveryReward(dish, 3)).toBe(3_750);
    expect(() => cookingStandingDeliveryReward(dish, 21)).toThrow("standing_delivery_limit");
  });
});
