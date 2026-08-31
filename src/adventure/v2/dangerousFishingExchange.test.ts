import { describe, expect, it } from "vitest";
import { TITLES } from "@/adventure/data/titles";
import {
  DANGEROUS_FISHING_MATERIALS,
  dangerousBossMaterialId,
  dangerousCatchMaterialId,
} from "@/adventure/data/v2/dangerousFishing";
import {
  DANGEROUS_FISHING_EXCHANGE_ENTRIES,
  DANGEROUS_FISHING_EXCHANGE_ENTRY_BY_ID,
  eligibleCatchMaterialIds,
  selectCatchMaterials,
  validateCatchSelection,
} from "./dangerousFishingExchange";

describe("위험 해역 교환 카탈로그", () => {
  it("위험 어획물 등급마다 승인된 미끼 교환을 정의한다", () => {
    expect(
      DANGEROUS_FISHING_EXCHANGE_ENTRY_BY_ID.get(
        "catch_common_to_reef_bait",
      ),
    ).toMatchObject({
      cost: { kind: "catch", rarity: "common", count: 4 },
      output: { kind: "bait", baitId: "reef_bait", count: 5 },
    });
    expect(
      DANGEROUS_FISHING_EXCHANGE_ENTRY_BY_ID.get(
        "catch_legendary_to_abyss_bait",
      ),
    ).toMatchObject({
      cost: { kind: "catch", rarity: "legendary", count: 2 },
      output: { kind: "bait", baitId: "abyss_bait", count: 5 },
    });
  });

  it("장비·칭호·영구 꾸미기·반복 미끼 교환을 모두 정의한다", () => {
    expect(DANGEROUS_FISHING_EXCHANGE_ENTRIES).toHaveLength(12);
    expect(
      DANGEROUS_FISHING_EXCHANGE_ENTRY_BY_ID.get("token_leviathan_rod"),
    ).toMatchObject({
      cost: {
        kind: "materials",
        materials: {
          danger_boss_tidal_colossus: 8,
          danger_boss_abyss_kraken: 4,
        },
        fishingCoins: 40_000,
      },
      output: { kind: "gear", gearKind: "rod", gearId: "leviathan_rod" },
    });
    expect(
      DANGEROUS_FISHING_EXCHANGE_ENTRY_BY_ID.get("token_abyssal_border"),
    ).toMatchObject({
      output: {
        kind: "cosmetic",
        itemId: "dangerous_abyssal_profile_border",
      },
    });
  });

  it("혼합 납품은 보유량, 가치, 카탈로그 순으로 선택한다", () => {
    expect(
      selectCatchMaterials(
        "rare",
        {
          danger_catch_ironjaw_tuna: 2,
          danger_catch_thunder_ray: 5,
          danger_catch_lantern_eel: 5,
        },
        4,
      ),
    ).toEqual({ danger_catch_thunder_ray: 4 });
  });

  it("한 어종으로 부족하면 다음 우선순위 어종을 섞는다", () => {
    expect(
      selectCatchMaterials(
        "rare",
        {
          danger_catch_ironjaw_tuna: 2,
          danger_catch_thunder_ray: 3,
          danger_catch_lantern_eel: 1,
        },
        5,
      ),
    ).toEqual({
      danger_catch_thunder_ray: 3,
      danger_catch_ironjaw_tuna: 2,
    });
  });

  it("다른 등급·알 수 없는 재료·잘못된 합계를 거부한다", () => {
    expect(
      validateCatchSelection("rare", 4, {
        danger_catch_razor_sardine: 4,
      }),
    ).toBe(false);
    expect(
      validateCatchSelection("rare", 4, {
        danger_catch_unknown: 4,
      }),
    ).toBe(false);
    expect(
      validateCatchSelection("rare", 4, {
        danger_catch_ironjaw_tuna: 3,
      }),
    ).toBe(false);
    expect(
      validateCatchSelection("rare", 4, {
        danger_catch_ironjaw_tuna: 2,
        danger_catch_thunder_ray: 2,
      }),
    ).toBe(true);
  });

  it("등급별 적격 어획물 ID만 반환한다", () => {
    expect(eligibleCatchMaterialIds("legendary")).toEqual([
      dangerousCatchMaterialId("abyssal_crownfish"),
      dangerousCatchMaterialId("starless_leviathan"),
    ]);
    expect(eligibleCatchMaterialIds("common")).toEqual([
      dangerousCatchMaterialId("razor_sardine"),
      dangerousCatchMaterialId("glassscale_herring"),
      dangerousCatchMaterialId("storm_mackerel"),
      dangerousCatchMaterialId("gale_needlefish"),
    ]);
  });

  it("재료와 칭호 설명에서 실제 교환 사용처를 안내한다", () => {
    expect(
      DANGEROUS_FISHING_MATERIALS[
        dangerousCatchMaterialId("ironjaw_tuna")
      ].description,
    ).toContain("위험 해역 교환");
    expect(
      DANGEROUS_FISHING_MATERIALS[
        dangerousBossMaterialId("tidal_colossus")
      ].description,
    ).toContain("한정 꾸미기");
    expect(TITLES.dangerous_tidal_conqueror).toMatchObject({
      name: "파도를 거둔 자",
      category: "fishing",
    });
    expect(TITLES.dangerous_abyss_conqueror).toMatchObject({
      name: "심연을 낚은 자",
      category: "fishing",
    });
  });
});
