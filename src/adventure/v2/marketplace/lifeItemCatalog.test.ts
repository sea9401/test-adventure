import { describe, expect, it } from "vitest";
import {
  MARKETPLACE_LIFE_ITEM_IDS,
  isMarketplaceLifeItemId,
  marketplaceLifeItemDefinition,
} from "./lifeItemCatalog";

describe("생활 재료 거래 카탈로그", () => {
  it("승인된 씨앗·농축산물·어획물·주방 재료 53종만 노출한다", () => {
    expect(MARKETPLACE_LIFE_ITEM_IDS).toHaveLength(53);
    expect(new Set(MARKETPLACE_LIFE_ITEM_IDS).size).toBe(53);
    expect(marketplaceLifeItemDefinition("farm_seed:wheat")).toMatchObject({
      name: "밀 씨앗",
      source: "farm_seed",
      sourceItemId: "wheat",
    });
    expect(marketplaceLifeItemDefinition("farm_item:golden_wheat")).toMatchObject({
      name: "황금 밀",
      source: "farm_item",
      sourceItemId: "golden_wheat",
    });
    expect(marketplaceLifeItemDefinition("fishing_catch:catch_common")).toMatchObject({
      name: "일반 어획물",
      source: "fishing_catch",
      sourceItemId: "catch_common",
    });
    expect(
      marketplaceLifeItemDefinition("cooking_kitchen:processed:flour"),
    ).toMatchObject({
      name: "밀가루",
      source: "cooking_kitchen",
      sourceItemId: "processed:flour",
    });
  });

  it("배합 사료와 알 수 없는 접두사·프로토타입 키는 거부한다", () => {
    expect(isMarketplaceLifeItemId("farm_item:compound_feed")).toBe(false);
    expect(isMarketplaceLifeItemId("farm_seed:unknown")).toBe(false);
    expect(isMarketplaceLifeItemId("toString")).toBe(false);
    expect(marketplaceLifeItemDefinition("constructor")).toBeNull();
  });
});
