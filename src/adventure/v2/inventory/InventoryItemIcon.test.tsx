import { describe, expect, it } from "vitest";
import { inventoryIconKind } from "./InventoryItemIcon";

describe("inventoryIconKind", () => {
  it("재료 계열을 서로 다른 아이콘으로 구분한다", () => {
    expect(inventoryIconKind("v2_oak_log")).toBe("tree");
    expect(inventoryIconKind("v2_gold_ore")).toBe("ore");
    expect(inventoryIconKind("v2_craft_aurora_crystal")).toBe("crystal");
    expect(inventoryIconKind("v2_boss_summon_scroll")).toBe("scroll");
    expect(inventoryIconKind("v2_wall_repair_kit")).toBe("toolbox");
  });

  it("강화석과 재련석의 용도를 색과 모양으로 구분한다", () => {
    expect(inventoryIconKind("v2_red_enhance_stone")).toBe("enhance-red");
    expect(inventoryIconKind("v2_blue_enhance_stone")).toBe("enhance-blue");
    expect(inventoryIconKind("v2_reforge_stone_high")).toBe("reforge");
  });

  it("소모품 용도에 맞는 아이콘을 선택한다", () => {
    expect(inventoryIconKind("sp_fruit_3")).toBe("fruit");
    expect(inventoryIconKind("v2_coop_mastery_tome")).toBe("book");
    expect(inventoryIconKind("v2_coop_tier5_equipment_box")).toBe("treasure");
    expect(inventoryIconKind("profile_image_permit")).toBe("camera");
    expect(inventoryIconKind("rename_permit")).toBe("identity");
    expect(inventoryIconKind("exp_tome")).toBe("flask");
  });
});
