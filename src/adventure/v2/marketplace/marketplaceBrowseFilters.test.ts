import { describe, expect, it } from "vitest";
import type { V2EquipmentId } from "@/adventure/data/v2/v2Equipment";
import {
  matchesMarketplaceEquipmentTier,
  matchesMarketplaceUnregisteredCodex,
} from "./marketplaceBrowseFilters";

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

describe("거래소 도감 미등록 장비 필터", () => {
  const registeredIds = new Set<V2EquipmentId>(["v2_iron_sword"]);

  it("필터가 꺼져 있거나 도감 로딩 전이면 매물을 보존한다", () => {
    expect(
      matchesMarketplaceUnregisteredCodex(
        "v2_iron_sword",
        false,
        true,
        registeredIds,
      ),
    ).toBe(true);
    expect(
      matchesMarketplaceUnregisteredCodex(
        "v2_iron_sword",
        true,
        false,
        registeredIds,
      ),
    ).toBe(true);
  });

  it("로드 후에는 등록 장비를 제외하고 미등록 장비만 보존한다", () => {
    expect(
      matchesMarketplaceUnregisteredCodex(
        "v2_iron_sword",
        true,
        true,
        registeredIds,
      ),
    ).toBe(false);
    expect(
      matchesMarketplaceUnregisteredCodex(
        "v2_greatsword",
        true,
        true,
        registeredIds,
      ),
    ).toBe(true);
  });

  it("카탈로그에 없는 옛 ID는 미등록 장비로 노출하지 않는다", () => {
    expect(
      matchesMarketplaceUnregisteredCodex(
        "legacy_unknown",
        true,
        true,
        registeredIds,
      ),
    ).toBe(false);
  });
});
