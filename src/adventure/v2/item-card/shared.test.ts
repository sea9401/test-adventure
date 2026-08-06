import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { V2_EQUIPMENT } from "@/adventure/data/v2/v2Equipment";
import { itemNameClass, QualityPctText } from "./shared";

describe("itemNameClass", () => {
  it("uses the set color before the unique color", () => {
    const alphaSword = V2_EQUIPMENT.v2_den_sig_alpha_greatsword;

    expect(alphaSword.rarity).toBe("unique");
    expect(alphaSword.setId).toBe("sig_predator");
    expect(itemNameClass(alphaSword)).toBe(
      "text-emerald-600 dark:text-emerald-400",
    );
  });

  it("uses the set color before the signature treatment", () => {
    const priestNecklace = V2_EQUIPMENT.v2_sanctum_sig_priest_necklace;

    expect(priestNecklace.rarity).toBe("unique");
    expect(priestNecklace.setId).toBe("sig_relic");
    expect(priestNecklace.signature).toBeDefined();
    expect(itemNameClass(priestNecklace)).toBe(
      "text-emerald-600 dark:text-emerald-400",
    );
  });

  it("keeps the signature treatment for a non-set unique item", () => {
    const eclipseStaff = V2_EQUIPMENT.v2_throne_sig_eclipse_staff;

    expect(eclipseStaff.rarity).toBe("unique");
    expect(eclipseStaff.setId).toBeUndefined();
    expect(eclipseStaff.signature).toBeDefined();
    expect(itemNameClass(eclipseStaff)).toBe("ui-item-name-signature");
  });

  it("uses purple for a unique item without a set or signature", () => {
    const spireStaff = V2_EQUIPMENT.v2_sanctum_sig_spire_staff;

    expect(spireStaff.rarity).toBe("unique");
    expect(spireStaff.setId).toBeUndefined();
    expect(spireStaff.signature).toBeUndefined();
    expect(itemNameClass(spireStaff)).toBe(
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

describe("QualityPctText", () => {
  it("renders perfect quality with a vivid solid color", () => {
    const html = renderToStaticMarkup(createElement(QualityPctText, { pct: 100 }));

    expect(html).toContain("text-fuchsia-600");
    expect(html).toContain("dark:text-fuchsia-300");
    expect(html).not.toContain("text-transparent");
    expect(html).not.toContain("background-image");
  });
});
