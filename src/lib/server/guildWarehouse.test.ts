import { describe, expect, it } from "vitest";
import { ENHANCE_STONE_MATERIAL_ID } from "@/adventure/data/v2/v2Enhance";
import {
  guildWarehouseUsedSlots,
  isGuildWarehouseMaterialId,
  parseGuildWarehouseInventory,
  parseGuildWarehouseState,
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

  it("재료 스택과 장비 개체가 각각 한 슬롯을 사용한다", () => {
    expect(
      guildWarehouseUsedSlots({
        materials: { [materialId]: 999 },
        equipment: [{ iid: "eq-1", id: "v2_iron_sword" }],
      }),
    ).toBe(2);
  });

  it("최초 버전 flat 재료 맵을 읽고 장비 개체 옵션을 보존한다", () => {
    expect(parseGuildWarehouseState({ [materialId]: 4 })).toEqual({
      materials: { [materialId]: 4 },
      equipment: [],
    });
    expect(
      parseGuildWarehouseState({
        materials: { [materialId]: 2 },
        equipment: [
          {
            iid: "eq-1",
            id: "v2_iron_sword",
            locked: true,
            enhance: { level: 3, bonusPct: 4 },
          },
        ],
      }),
    ).toMatchObject({
      materials: { [materialId]: 2 },
      equipment: [
        {
          iid: "eq-1",
          id: "v2_iron_sword",
          locked: true,
          enhance: { level: 3, bonusPct: 4 },
        },
      ],
    });
  });
});
