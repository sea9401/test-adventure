import { describe, expect, it } from "vitest";
import { matchesMarketplaceEquipmentTier } from "./marketplaceBrowseFilters";

describe("거래소 장비 표시 티어 필터", () => {
  it("내부 카탈로그 티어를 화면의 1T~6T로 압축해서 비교한다", () => {
    expect(matchesMarketplaceEquipmentTier("v2_iron_sword", "1")).toBe(true);
    expect(matchesMarketplaceEquipmentTier("v2_iron_sword", "2")).toBe(false);

    expect(matchesMarketplaceEquipmentTier("v2_crafted_oathblade", "2")).toBe(
      true,
    );
    expect(matchesMarketplaceEquipmentTier("v2_crafted_oathblade", "4")).toBe(
      false,
    );
  });

  it("전체는 알 수 없는 옛 ID도 보존하고 특정 티어는 제외한다", () => {
    expect(matchesMarketplaceEquipmentTier("legacy_unknown", "all")).toBe(
      true,
    );
    expect(matchesMarketplaceEquipmentTier("legacy_unknown", "1")).toBe(
      false,
    );
  });
});
