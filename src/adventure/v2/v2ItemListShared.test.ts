import { describe, expect, it } from "vitest";
import { SP_FRUIT_TIERS, SP_FRUIT } from "@/adventure/data/v2/spFruit";
import {
  itemTabForMarketplaceListing,
  itemTabForMaterial,
} from "./v2ItemListShared";

describe("itemTabForMaterial", () => {
  it("SP 열매를 인벤토리와 거래소의 소모품 탭으로 분류한다", () => {
    for (const tier of SP_FRUIT_TIERS) {
      expect(itemTabForMaterial(SP_FRUIT[tier].materialId)).toBe("consumable");
      expect(
        itemTabForMarketplaceListing(
          "material",
          SP_FRUIT[tier].materialId,
        ),
      ).toBe("consumable");
    }
  });

  it("일반 재료는 재료 탭으로 분류한다", () => {
    expect(itemTabForMaterial("mana_dust")).toBe("material");
    expect(itemTabForMarketplaceListing("material", "mana_dust")).toBe(
      "material",
    );
    expect(itemTabForMarketplaceListing("consumable", "rare_map")).toBe(
      "consumable",
    );
  });
});
