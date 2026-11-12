// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { InventoryItemIcon, inventoryIconKind } from "./InventoryItemIcon";

afterEach(cleanup);

describe("InventoryItemIcon", () => {
  it("전투 준비물은 품목 그림을 요청한 크기로 보여 준다", () => {
    const { container } = render(<InventoryItemIcon itemId="v2_prep_brace_master" size={22} className="shrink-0" />);
    const image = container.querySelector("img");
    expect(decodeURIComponent(image?.getAttribute("src") ?? "")).toContain(
      "/images/items/battle-prep/v2_prep_brace_master.webp",
    );
    expect(image?.getAttribute("width")).toBe("22");
    expect(image?.getAttribute("alt")).toBe("");
    expect(image?.className).toContain("shrink-0");
    expect(container.querySelector("svg")).toBeNull();
  });

  it("그림이 없는 재료는 계열 아이콘을 그린다", () => {
    const { container } = render(<InventoryItemIcon itemId="v2_oak_log" size={22} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });
});

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
    expect(inventoryIconKind("adventure_support_premium_30d")).toBe(
      "sparkle",
    );
    expect(inventoryIconKind("cultivation_reset_potion")).toBe("flask");
    expect(inventoryIconKind("level_100_elixir")).toBe("flask");
    expect(inventoryIconKind("exp_tome")).toBe("flask");
    expect(inventoryIconKind("v2_stamina_shard")).toBe("flask");
    expect(inventoryIconKind("v2_enhance_ember")).toBe("ember");
    expect(inventoryIconKind("v2_torn_map_fragment")).toBe("map");
  });
});
