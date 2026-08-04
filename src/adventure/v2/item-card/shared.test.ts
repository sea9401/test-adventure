import { describe, expect, it } from "vitest";
import { V2_EQUIPMENT } from "@/adventure/data/v2/v2Equipment";
import { itemNameClass } from "./shared";

describe("itemNameClass", () => {
  it("uses the unique color before power-based colors", () => {
    const alphaSword = V2_EQUIPMENT.v2_den_sig_alpha_greatsword;

    expect(alphaSword.rarity).toBe("unique");
    expect(itemNameClass(alphaSword)).toBe(
      "text-purple-600 dark:text-purple-400",
    );
  });

  it("uses the same unique color for an item with a signature effect", () => {
    const priestNecklace = V2_EQUIPMENT.v2_sanctum_sig_priest_necklace;

    expect(priestNecklace.rarity).toBe("unique");
    expect(priestNecklace.signature).toBeDefined();
    expect(itemNameClass(priestNecklace)).toBe(
      "text-purple-600 dark:text-purple-400",
    );
  });

  it("uses the set color before power-based colors for regular set equipment", () => {
    const canyonArmor = V2_EQUIPMENT.v2_canyon_set_armor;

    expect(canyonArmor.rarity).not.toBe("unique");
    expect(canyonArmor.setId).toBe("dry_canyon");
    expect(itemNameClass(canyonArmor)).toBe(
      "text-emerald-600 dark:text-emerald-400",
    );
  });

  it("keeps the signature treatment for non-unique equipment", () => {
    const venomDagger = V2_EQUIPMENT.v2_crafted_venom_gland_dagger;

    expect(venomDagger.rarity).not.toBe("unique");
    expect(venomDagger.signature).toBeDefined();
    expect(itemNameClass(venomDagger)).toBe("ui-item-name-signature");
  });
});
