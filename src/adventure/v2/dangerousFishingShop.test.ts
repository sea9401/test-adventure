import { describe, expect, it } from "vitest";
import { emptyDangerousFishingState } from "./dangerousFishingState";
import {
  buyDangerousBaitPack,
  buyDangerousGear,
  consumeDangerousBait,
  equipDangerousGear,
} from "./dangerousFishingShop";

describe("위험 해역 낚시 코인 상점", () => {
  it("무료 스타터 장비는 재구매하거나 코인을 소모하지 않는다", () => {
    const state = emptyDangerousFishingState();
    expect(buyDangerousGear(state, 20_000, "rod", "starter_rod")).toEqual({
      ok: false,
      error: "already_owned",
      state,
      coins: 20_000,
    });
  });

  it("보유하지 않은 장비는 장착할 수 없다", () => {
    const state = emptyDangerousFishingState();
    expect(equipDangerousGear(state, "line", "braided_line")).toEqual({
      ok: false,
      error: "not_owned",
      state,
    });
  });

  it("영구 장비는 정확한 코인을 한 번만 차감하고 구매 뒤 장착한다", () => {
    const state = emptyDangerousFishingState();
    const bought = buyDangerousGear(state, 30_000, "rod", "breaker_rod");
    expect(bought).toMatchObject({ ok: true, coins: 5_000 });
    if (!bought.ok) return;
    expect(bought.state.ownedGear.rods).toEqual([
      "starter_rod",
      "breaker_rod",
    ]);

    const duplicate = buyDangerousGear(
      bought.state,
      bought.coins,
      "rod",
      "breaker_rod",
    );
    expect(duplicate).toEqual({
      ok: false,
      error: "already_owned",
      state: bought.state,
      coins: 5_000,
    });
    expect(equipDangerousGear(bought.state, "rod", "breaker_rod")).toMatchObject({
      ok: true,
      state: { loadout: { rodId: "breaker_rod" } },
    });
  });

  it("잔액이 가격보다 적으면 상태와 코인을 보존한다", () => {
    const state = emptyDangerousFishingState();
    expect(buyDangerousGear(state, 14_999, "reel", "current_reel")).toEqual({
      ok: false,
      error: "insufficient_coins",
      state,
      coins: 14_999,
    });
  });

  it("특수 미끼 묶음은 수량을 더하고 기본 미끼는 소비하지 않는다", () => {
    const state = emptyDangerousFishingState();
    const bought = buyDangerousBaitPack(state, 2_000, "blood_bait");
    expect(bought).toMatchObject({
      ok: true,
      coins: 1_000,
      state: { baitCounts: { blood_bait: 5 } },
    });
    if (!bought.ok) return;
    const consumed = consumeDangerousBait(bought.state, "blood_bait");
    expect(consumed).toMatchObject({
      ok: true,
      consumed: true,
      state: { baitCounts: { blood_bait: 4 } },
    });
    expect(consumeDangerousBait(consumed.state, "basic_bait")).toEqual({
      ok: true,
      consumed: false,
      state: consumed.state,
    });
  });
});
