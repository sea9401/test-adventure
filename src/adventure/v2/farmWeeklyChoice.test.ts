import { describe, expect, it } from "vitest";
import {
  claimFarmWeeklyDelivery, emptyFarmState, getFarmWeeklyDeliveryRequests,
  parseFarmState, type FarmCropId, type FarmState,
} from "./farm";

const monday = Date.parse("2026-09-07T00:00:00+09:00");
const nextMonday = monday + 7 * 24 * 60 * 60 * 1000;
const oldIds = ["weekly-bakery-crate", "weekly-clinic-bundle", "weekly-market-cart"];

describe("농장 주간 작물 선택 납품", () => {
  it.each([
    ["tomato", 15, 3], ["strawberry", 8, 2], ["potato", 10, 1], ["onion", 7, 1],
    ["rice", 8, 1], ["soybean", 7, 1], ["sugarcane", 6, 1], ["cacao", 4, 1],
  ] as const)("%s 납품은 정해진 수량만 차감하고 해당 씨앗을 지급한다", (crop: FarmCropId, quantity, seeds) => {
    const initial = { ...emptyFarmState(monday), seeds: {}, inventory: { [crop]: quantity + 1 } };
    const { state, result } = claimFarmWeeklyDelivery(initial, `weekly-${crop}`, monday);
    expect(state.inventory[crop]).toBe(1);
    expect(state.seeds[crop]).toBe(seeds);
    expect(result.rewardReputation).toBe(7);
    expect(state.weekly.claimedIds).toEqual([`weekly-${crop}`]);
    expect(initial.inventory[crop]).toBe(quantity + 1);
  });

  it("3종 납품 후 네 번째는 재료와 보상을 바꾸지 않고 거절한다", () => {
    let state: FarmState = { ...emptyFarmState(monday), inventory: { wheat: 30, tomato: 15, cacao: 4, herb: 16 } };
    for (const id of [oldIds[0], "weekly-tomato", "weekly-cacao"]) {
      state = claimFarmWeeklyDelivery(state, id, monday).state;
    }
    const before = structuredClone(state);
    expect(() => claimFarmWeeklyDelivery(state, oldIds[1], monday)).toThrow("weekly_delivery_limit");
    expect(state).toEqual(before);
  });

  it("기존 3종 완료 세이브도 이번 주 3건으로 인정하고 다음 주에는 다시 선택할 수 있다", () => {
    const initial = emptyFarmState(monday);
    const saved = parseFarmState({ ...initial, weekly: { ...initial.weekly, claimedIds: oldIds }, inventory: { cacao: 8 } }, monday);
    expect(() => claimFarmWeeklyDelivery(saved, "weekly-cacao", monday)).toThrow("weekly_delivery_limit");
    const { state } = claimFarmWeeklyDelivery(saved, "weekly-cacao", nextMonday);
    expect(state.weekly.claimedIds).toEqual(["weekly-cacao"]);
    expect(state.inventory.cacao).toBe(4);
    expect(() => claimFarmWeeklyDelivery(state, "weekly-cacao", nextMonday)).toThrow("weekly_delivery_already_claimed");
  });

  it("재료 부족 실패는 이번 주 선택 횟수를 소비하지 않는다", () => {
    const state = emptyFarmState(monday);
    expect(() => claimFarmWeeklyDelivery(state, "weekly-cacao", monday)).toThrow("not_enough_items");
    expect(state.weekly.claimedIds).toEqual([]);
  });

  it("카카오 희귀 보너스는 왕실 카카오 한 개를 소비하고 증표 14개를 더 지급한다", () => {
    const initial = { ...emptyFarmState(monday), inventory: { cacao: 4, royal_cacao: 2 } };
    const { state, result } = claimFarmWeeklyDelivery(initial, "weekly-cacao", monday);
    expect(state.inventory.royal_cacao).toBe(1);
    expect(result.rareBonusApplied).toBe(true);
    expect(state.stats.reputation).toBe(21);
  });

  it("모든 작물에 하나씩 고유한 주문이 있고 기존 주문 ID가 유지된다", () => {
    const requests = getFarmWeeklyDeliveryRequests();
    expect(requests).toHaveLength(11);
    expect(new Set(requests.map(r => r.id)).size).toBe(11);
    expect(requests.slice(0, 3).map(r => r.id)).toEqual(oldIds);
  });
});
