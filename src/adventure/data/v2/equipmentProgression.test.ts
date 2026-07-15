import { describe, expect, it } from "vitest";
import { V2_EQUIPMENT } from "./v2Equipment";
import {
  equipmentProgressionLock,
  equipmentProgressionRequirement,
} from "./equipmentProgression";

describe("equipment progression requirements", () => {
  it("keeps starter field equipment unrestricted", () => {
    expect(equipmentProgressionRequirement("v2_iron_sword")).toBeNull();
    expect(equipmentProgressionRequirement("v2_mithril_sword")).toBeNull();
  });

  it("unlocks each regular band after clearing the previous hunting area", () => {
    expect(equipmentProgressionRequirement("v2_canyon_greatsword")).toEqual({
      minFrontierDepth: 6,
      label: "들판 6 돌파",
    });
    expect(equipmentProgressionRequirement("v2_lake_greatsword")).toEqual({
      minFrontierDepth: 12,
      label: "마른 협곡 6 돌파",
    });
    expect(equipmentProgressionRequirement("v2_throne_greatsword")).toEqual({
      minFrontierDepth: 42,
      label: "짐승의 소굴 6 돌파",
    });
  });

  it("distinguishes the three hunting areas that share catalog tier 12", () => {
    expect(equipmentProgressionRequirement("v2_plateau_greatsword")?.minFrontierDepth)
      .toBe(54);
    expect(equipmentProgressionRequirement("v2_stormpeak_greatsword")?.minFrontierDepth)
      .toBe(60);
    expect(equipmentProgressionRequirement("v2_abyssruin_greatsword")?.minFrontierDepth)
      .toBe(66);
    expect(
      equipmentProgressionRequirement("v2_abyssruin_sig_apostle_staff")
        ?.minFrontierDepth,
    ).toBe(66);
  });

  it("uses the associated hard-boss anchor for boss equipment", () => {
    expect(equipmentProgressionRequirement("v2_boss_void_bastion")?.minFrontierDepth)
      .toBe(60);
    expect(
      equipmentProgressionRequirement("v2_hard_sangoon_cleaver")
        ?.minFrontierDepth,
    ).toBe(68);
    expect(
      equipmentProgressionRequirement("v2_boss_abyssal_armor")
        ?.minFrontierDepth,
    ).toBe(60);
  });

  it("unlocks exactly at the required frontier depth", () => {
    expect(equipmentProgressionLock("v2_lake_greatsword", 11)?.label).toBe(
      "마른 협곡 6 돌파",
    );
    expect(equipmentProgressionLock("v2_lake_greatsword", 12)).toBeNull();
  });

  it("assigns every non-starter catalog item a progression requirement", () => {
    for (const item of Object.values(V2_EQUIPMENT)) {
      if (item.tier <= 3) continue;
      expect(
        equipmentProgressionRequirement(item),
        `missing requirement: ${item.id}`,
      ).not.toBeNull();
    }
  });
});
