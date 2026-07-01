import { describe, expect, it } from "vitest";
import {
  marketplacePriceKeyForEquipInstance,
  marketplacePriceKeyForPayload,
} from "./marketplacePriceKeys";

const craftedBy = {
  userId: "u1",
  profession: "blacksmith",
  level: 8,
  craftedAt: "2026-01-01T00:00:00.000Z",
} as const;

describe("marketplacePriceKeys", () => {
  it("keeps ordinary equipment on the base item price key", () => {
    expect(
      marketplacePriceKeyForEquipInstance({
        iid: "eq1",
        id: "v2_iron_sword",
      }),
    ).toBe("v2_iron_sword");
  });

  it("separates crafted quality and masterwork equipment", () => {
    expect(
      marketplacePriceKeyForPayload("v2_iron_sword", { craftedBy }),
    ).toBe("v2_iron_sword#crafted");
    expect(
      marketplacePriceKeyForPayload("v2_iron_sword", {
        craftedBy,
        craftQuality: { level: 1, bonusPct: 5 },
      }),
    ).toBe("v2_iron_sword#quality1");
    expect(
      marketplacePriceKeyForPayload("v2_iron_sword", {
        craftedBy: { ...craftedBy, masterwork: true },
        craftQuality: { level: 2, bonusPct: 10 },
      }),
    ).toBe("v2_iron_sword#masterwork");
  });

  it("uses the craft-only key before other crafted markers", () => {
    expect(
      marketplacePriceKeyForEquipInstance({
        iid: "eq2",
        id: "v2_crafted_oathblade",
        craftedBy: { ...craftedBy, masterwork: true },
        craftQuality: { level: 2, bonusPct: 10 },
      }),
    ).toBe("v2_crafted_oathblade#craftOnly");
  });
});
