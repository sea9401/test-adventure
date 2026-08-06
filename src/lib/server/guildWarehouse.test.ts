import { describe, expect, it } from "vitest";
import { ENHANCE_STONE_MATERIAL_ID } from "@/adventure/data/v2/v2Enhance";
import {
  guildWarehouseUsed,
  isGuildWarehouseMaterialId,
  parseGuildWarehouseInventory,
} from "./guildWarehouse";

describe("guildWarehouse", () => {
  const materialId = ENHANCE_STONE_MATERIAL_ID.red;

  it("카탈로그에 등록된 재료만 창고 품목으로 허용한다", () => {
    expect(isGuildWarehouseMaterialId(materialId)).toBe(true);
    expect(isGuildWarehouseMaterialId("unknown_material")).toBe(false);
    expect(isGuildWarehouseMaterialId(null)).toBe(false);
  });

  it("양의 안전 정수만 보존하고 알 수 없는 키와 손상 수량을 제거한다", () => {
    expect(
      parseGuildWarehouseInventory({
        [materialId]: 12.9,
        unknown_material: 10,
        v2_blue_enhance_stone: -1,
        v2_reforge_stone: Number.POSITIVE_INFINITY,
      }),
    ).toEqual({ [materialId]: 12 });
  });

  it("보관 중인 전체 재료 수량을 합산한다", () => {
    expect(guildWarehouseUsed({ a: 3, b: 7 })).toBe(10);
  });
});
