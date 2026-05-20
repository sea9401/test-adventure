// shop 서버 lib 의 순수 계산(computeShopOutcome) 검증. DB I/O(applyShopAction)는
// 통합 테스트 인프라가 없어 제외 — 수동 시나리오(npm run dev + Network 탭)로 검증.

import { describe, expect, it } from "vitest";
import { ShopError, computeShopOutcome, type ShopComputeInput } from "./shop";

const base = (): ShopComputeInput => ({
  gold: 100,
  potions: {},
  materials: {},
  equipment: {},
  consumables: {},
  potionCapacityBonus: 0,
});

describe("computeShopOutcome", () => {
  it("buy_potion — 골드 차감 + 인벤 증가", () => {
    const r = computeShopOutcome(
      { ...base(), gold: 10 },
      { kind: "buy_potion", id: "potion_heal_s", quantity: 3 },
    );
    expect(r.newGold).toBe(7); // price 1 × 3
    expect(r.potions.potion_heal_s).toBe(3);
    expect(r.applied).toEqual({
      kind: "buy_potion",
      id: "potion_heal_s",
      quantity: 3,
      goldDelta: -3,
    });
  });

  it("buy_potion — 캡 초과분은 잘리고 잘린 만큼만 과금", () => {
    const r = computeShopOutcome(
      { ...base(), potions: { potion_heal_s: 13 } }, // base cap 15 → room 2
      { kind: "buy_potion", id: "potion_heal_s", quantity: 5 },
    );
    expect(r.potions.potion_heal_s).toBe(15);
    expect(r.applied.quantity).toBe(2);
    expect(r.newGold).toBe(98);
  });

  it("buy_potion — 캡 보너스만큼 더 살 수 있음", () => {
    const r = computeShopOutcome(
      { ...base(), potions: { potion_heal_s: 15 }, potionCapacityBonus: 3 },
      { kind: "buy_potion", id: "potion_heal_s", quantity: 10 },
    );
    expect(r.potions.potion_heal_s).toBe(18);
    expect(r.applied.quantity).toBe(3);
  });

  it("buy_potion — 캡 가득이면 full", () => {
    expect(() =>
      computeShopOutcome(
        { ...base(), potions: { potion_heal_s: 15 } },
        { kind: "buy_potion", id: "potion_heal_s", quantity: 1 },
      ),
    ).toThrow(ShopError);
  });

  it("buy_potion — 골드 부족이면 insufficient_gold (상태 변경 없이 throw)", () => {
    expect(() =>
      computeShopOutcome(
        { ...base(), gold: 0 },
        { kind: "buy_potion", id: "potion_heal_s", quantity: 1 },
      ),
    ).toThrow(/insufficient_gold/);
  });

  it("buy_material — inShop=false 재료는 누적 판매 임계 미달이면 locked", () => {
    expect(() =>
      computeShopOutcome(
        { ...base(), soldCounts: { slime_chunk: 50 } },
        { kind: "buy_material", id: "slime_chunk", quantity: 1 },
      ),
    ).toThrow(/locked/);
  });

  it("buy_material — soldCounts 미동봉이면 locked", () => {
    expect(() =>
      computeShopOutcome(base(), { kind: "buy_material", id: "slime_chunk", quantity: 1 }),
    ).toThrow(/locked/);
  });

  it("buy_material — 임계 도달이면 구매 가능", () => {
    const r = computeShopOutcome(
      { ...base(), soldCounts: { slime_chunk: 100 } },
      { kind: "buy_material", id: "slime_chunk", quantity: 2 },
    );
    expect(r.materials.slime_chunk).toBe(2);
    expect(r.newGold).toBe(100 - 3 * 2); // slime_chunk price 3
  });

  it("buy_material — inShop=true(branch)는 잠금 없이 구매", () => {
    const r = computeShopOutcome(
      { ...base(), gold: 10 },
      { kind: "buy_material", id: "branch", quantity: 4 },
    );
    expect(r.materials.branch).toBe(4);
    expect(r.newGold).toBe(6); // price 1 × 4
  });

  it("buy_material — qty 99 은 통과", () => {
    const r = computeShopOutcome(
      { ...base(), gold: 100 },
      { kind: "buy_material", id: "branch", quantity: 99 },
    );
    expect(r.materials.branch).toBe(99);
    expect(r.newGold).toBe(1); // price 1 × 99
  });

  it("buy_material — qty 100 은 invalid_quantity (상점 1회 구매 상한)", () => {
    expect(() =>
      computeShopOutcome(
        { ...base(), gold: 1000 },
        { kind: "buy_material", id: "branch", quantity: 100 },
      ),
    ).toThrow(/invalid_quantity/);
  });

  it("buy_consumable — qty 100 은 invalid_quantity", () => {
    expect(() =>
      computeShopOutcome(
        { ...base(), gold: 100000 },
        { kind: "buy_consumable", id: "scroll_town_return", quantity: 100 },
      ),
    ).toThrow(/invalid_quantity/);
  });

  it("sell_material — qty 100 도 허용 (상점 상한은 buy 만)", () => {
    const r = computeShopOutcome(
      { ...base(), gold: 0, materials: { slime_core: 100 } },
      { kind: "sell_material", id: "slime_core", quantity: 100 },
    );
    expect(r.materials.slime_core).toBe(0);
    expect(r.newGold).toBeGreaterThan(0);
  });

  it("buy_consumable — 골드 차감 + 소모품 증가", () => {
    const r = computeShopOutcome(
      { ...base(), gold: 10 },
      { kind: "buy_consumable", id: "scroll_town_return", quantity: 2 },
    );
    expect(r.consumables.scroll_town_return).toBe(2);
    expect(r.newGold).toBe(4); // price 3 × 2
  });

  it("buy_equipment — shopPrice 지정 장비는 무등급 인스턴스로 구매", () => {
    const r = computeShopOutcome(
      { ...base(), gold: 50 },
      { kind: "buy_equipment", id: "worn_dagger", quantity: 1 },
    );
    expect(r.equipment.worn_dagger).toBe(1);
    expect(r.newGold).toBe(36); // shopPrice 14
    expect(r.applied.kind).toBe("buy_equipment");
  });

  it("buy_equipment — shopPrice 없는 장비는 not_for_sale", () => {
    expect(() =>
      computeShopOutcome(base(), {
        kind: "buy_equipment",
        id: "baseball_bat",
        quantity: 1,
      }),
    ).toThrow(ShopError);
  });

  it("buy_equipment — 골드 부족이면 insufficient_gold", () => {
    expect(() =>
      computeShopOutcome(
        { ...base(), gold: 5 },
        { kind: "buy_equipment", id: "worn_dagger", quantity: 1 },
      ),
    ).toThrow(ShopError);
  });

  it("buy_equipment — shopGate 걸린 장비는 flag 미충족이면 locked", () => {
    // 낡은 가죽갑옷: shopGate=boldQuestComplete. 의뢰 미완 상태에선 구매 불가.
    expect(() =>
      computeShopOutcome(
        { ...base(), gold: 100 },
        { kind: "buy_equipment", id: "old_leather_armor", quantity: 1 },
      ),
    ).toThrow(/locked/);
  });

  it("buy_equipment — shopGate 걸린 장비도 flag 충족이면 구매 가능", () => {
    const r = computeShopOutcome(
      { ...base(), gold: 100, craftingGates: { boldQuestComplete: true } },
      { kind: "buy_equipment", id: "old_leather_armor", quantity: 1 },
    );
    expect(r.equipment.old_leather_armor).toBe(1);
    expect(r.newGold).toBe(70); // shopPrice 30
  });

  it("sell_material — 보유분 차감 + 골드 지급", () => {
    const r = computeShopOutcome(
      { ...base(), gold: 0, materials: { slime_core: 5 } },
      { kind: "sell_material", id: "slime_core", quantity: 3 },
    );
    expect(r.materials.slime_core).toBe(2);
    expect(r.newGold).toBe(3); // slime_core sell 1 × 3
    expect(r.applied.goldDelta).toBe(3);
  });

  it("sell_material — 보유 부족이면 insufficient_items", () => {
    expect(() =>
      computeShopOutcome(
        { ...base(), materials: { slime_core: 1 } },
        { kind: "sell_material", id: "slime_core", quantity: 3 },
      ),
    ).toThrow(/insufficient_items/);
  });

  it("sell_potion — 보유분 차감 + 골드 지급", () => {
    const r = computeShopOutcome(
      { ...base(), gold: 0, potions: { potion_heal_s: 2 } },
      { kind: "sell_potion", id: "potion_heal_s", quantity: 2 },
    );
    expect(r.potions.potion_heal_s).toBe(0);
    expect(r.newGold).toBe(2); // sell 1 × 2
  });

  it("sell_equipment — 무등급(craftTier 미지정)은 equipment[] 에서 차감", () => {
    const r = computeShopOutcome(
      { ...base(), gold: 0, equipment: { baseball_bat: 2 } },
      { kind: "sell_equipment", id: "baseball_bat", quantity: 1 },
    );
    expect(r.equipment.baseball_bat).toBe(1);
    expect(r.applied.craftTier).toBeUndefined();
    expect(r.newGold).toBeGreaterThanOrEqual(0);
  });

  it("sell_equipment — craftTier 지정 시 craftedEquipment[id][tier] 에서 차감", () => {
    const r = computeShopOutcome(
      {
        ...base(),
        gold: 0,
        equipment: {},
        craftedEquipment: { baseball_bat: { "2": 2, "-1": 1 } },
      },
      { kind: "sell_equipment", id: "baseball_bat", quantity: 2, craftTier: 2 },
    );
    // "2" 등급 2개 모두 팔림 → 키 제거, "-1" 은 그대로
    expect(r.craftedEquipment.baseball_bat).toEqual({ "-1": 1 });
    expect(r.applied.craftTier).toBe(2);
    expect(r.equipment.baseball_bat).toBeUndefined();
  });

  it("sell_equipment — 잘못된 craftTier(0/범위 밖)는 무등급으로 취급", () => {
    const r = computeShopOutcome(
      { ...base(), gold: 0, equipment: { baseball_bat: 1 }, craftedEquipment: { baseball_bat: { "2": 1 } } },
      { kind: "sell_equipment", id: "baseball_bat", quantity: 1, craftTier: 0 },
    );
    expect(r.equipment.baseball_bat).toBe(0);
    expect(r.craftedEquipment.baseball_bat).toEqual({ "2": 1 });
    expect(r.applied.craftTier).toBeUndefined();
  });

  it("sell_equipment — 보유보다 많이 팔면 insufficient_items", () => {
    expect(() =>
      computeShopOutcome(
        { ...base(), craftedEquipment: { baseball_bat: { "1": 1 } } },
        { kind: "sell_equipment", id: "baseball_bat", quantity: 2, craftTier: 1 },
      ),
    ).toThrow(/insufficient_items/);
  });

  it("sell_equipment — dropQuality 지정 시 droppedEquipment[id][q] 에서 차감", () => {
    const r = computeShopOutcome(
      {
        ...base(),
        gold: 0,
        droppedEquipment: { baseball_bat: { "2": 2, "1": 1 } },
      },
      { kind: "sell_equipment", id: "baseball_bat", quantity: 2, dropQuality: 2 },
    );
    expect(r.droppedEquipment.baseball_bat).toEqual({ "1": 1 });
    expect(r.applied.dropQuality).toBe(2);
    expect(r.applied.craftTier).toBeUndefined();
  });

  it("sell_equipment — craftTier 와 dropQuality 동시 지정 시 craftTier 우선", () => {
    const r = computeShopOutcome(
      {
        ...base(),
        gold: 0,
        craftedEquipment: { baseball_bat: { "2": 1 } },
        droppedEquipment: { baseball_bat: { "1": 1 } },
      },
      {
        kind: "sell_equipment",
        id: "baseball_bat",
        quantity: 1,
        craftTier: 2,
        dropQuality: 1,
      },
    );
    expect(r.craftedEquipment.baseball_bat).toBeUndefined();
    expect(r.droppedEquipment.baseball_bat).toEqual({ "1": 1 });
    expect(r.applied.craftTier).toBe(2);
    expect(r.applied.dropQuality).toBeUndefined();
  });

  it("sell_equipment — 잘못된 dropQuality(0/범위 밖)는 기본 등급(equipment[])으로 취급", () => {
    const r = computeShopOutcome(
      {
        ...base(),
        gold: 0,
        equipment: { baseball_bat: 1 },
        droppedEquipment: { baseball_bat: { "1": 1 } },
      },
      { kind: "sell_equipment", id: "baseball_bat", quantity: 1, dropQuality: 3 },
    );
    expect(r.equipment.baseball_bat).toBe(0);
    expect(r.droppedEquipment.baseball_bat).toEqual({ "1": 1 });
    expect(r.applied.dropQuality).toBeUndefined();
  });

  it("unknown item → unknown_item", () => {
    expect(() =>
      computeShopOutcome(base(), { kind: "buy_potion", id: "nope", quantity: 1 }),
    ).toThrow(/unknown_item/);
  });

  it("quantity < 1 → invalid_quantity", () => {
    expect(() =>
      computeShopOutcome(base(), { kind: "buy_potion", id: "potion_heal_s", quantity: 0 }),
    ).toThrow(/invalid_quantity/);
  });

  it("골드가 NaN(손상)이면 corrupt_gold", () => {
    expect(() =>
      computeShopOutcome(
        { ...base(), gold: NaN },
        { kind: "buy_potion", id: "potion_heal_s", quantity: 1 },
      ),
    ).toThrow(/corrupt_gold/);
  });

  describe("buy_rune", () => {
    it("토큰 차감 + 룬 가산, 골드 불변", () => {
      const r = computeShopOutcome(
        { ...base(), gold: 999, materials: { tower_token: 50 } },
        { kind: "buy_rune", id: "rune_attack", quantity: 1, grade: 1 },
      );
      expect(r.newGold).toBe(999);
      expect(r.materials.tower_token).toBe(45); // 50 - 5(g1 가격)
      expect(r.runes.rune_attack?.[1]).toBe(1);
      expect(r.applied.kind).toBe("buy_rune");
      expect(r.applied.grade).toBe(1);
      expect(r.applied.tokenDelta).toBe(-5);
      expect(r.applied.goldDelta).toBe(0);
    });

    it("5등급 = 900토큰", () => {
      const r = computeShopOutcome(
        { ...base(), materials: { tower_token: 900 } },
        { kind: "buy_rune", id: "rune_crit", quantity: 1, grade: 5 },
      );
      expect(r.materials.tower_token).toBe(0);
      expect(r.runes.rune_crit?.[5]).toBe(1);
    });

    it("토큰 부족 시 insufficient_tokens", () => {
      expect(() =>
        computeShopOutcome(
          { ...base(), materials: { tower_token: 3 } },
          { kind: "buy_rune", id: "rune_attack", quantity: 1, grade: 1 },
        ),
      ).toThrow(/insufficient_tokens/);
    });

    it("미정의 룬 id → unknown_item", () => {
      expect(() =>
        computeShopOutcome(
          { ...base(), materials: { tower_token: 999 } },
          { kind: "buy_rune", id: "rune_fake", quantity: 1, grade: 1 },
        ),
      ).toThrow(/unknown_item/);
    });

    it("등급 미지정 → invalid_grade", () => {
      expect(() =>
        computeShopOutcome(
          { ...base(), materials: { tower_token: 999 } },
          { kind: "buy_rune", id: "rune_attack", quantity: 1 },
        ),
      ).toThrow(/invalid_grade/);
    });

    it("같은 (id, grade) 누적 구매 시 count 합산", () => {
      const r = computeShopOutcome(
        {
          ...base(),
          materials: { tower_token: 50 },
          runes: { rune_attack: { 1: 2 } },
        },
        { kind: "buy_rune", id: "rune_attack", quantity: 3, grade: 1 },
      );
      expect(r.materials.tower_token).toBe(35);
      expect(r.runes.rune_attack?.[1]).toBe(5);
    });
  });
});
