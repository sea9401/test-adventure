import { describe, expect, it } from "vitest";
import {
  canCastWithFormulaMana,
  formulaCompletionOverdraftSkillIds,
  formulaStagesForCast,
  optimizedMpCost,
  previewFormulaCast,
} from "./primordialSageCombat";

const empty = { stages: 0, seenSkillIds: [] } as const;

describe("태초현자 완전식", () => {
  it("classifies ordinary, composite, and non-magic casts from the resolved form", () => {
    expect(
      formulaStagesForCast("v2c_mage_fireball", "화염구"),
    ).toBe(1);
    expect(
      formulaStagesForCast(
        "v2c_elementallord_surge",
        "개벽·오원소 폭주",
      ),
    ).toBe(2);
    expect(
      formulaStagesForCast("v2c_mage_meditate", "명상"),
    ).toBe(0);
  });

  it("advances unused direct magic and completes the current spell at stage 3", () => {
    const first = previewFormulaCast({
      state: empty,
      skillId: "v2c_mage_fireball",
      stages: 1,
    });
    expect(first).toEqual({
      next: { stages: 1, seenSkillIds: ["v2c_mage_fireball"] },
      completes: false,
    });
    const completed = previewFormulaCast({
      state: first.next,
      skillId: "v2c_elementallord_surge",
      stages: 2,
    });
    expect(completed).toEqual({
      next: { stages: 0, seenSkillIds: [] },
      completes: true,
    });
  });

  it("does not advance or reset when the same skill id repeats", () => {
    const state = { stages: 2, seenSkillIds: ["v2c_mage_fireball"] } as const;
    expect(
      previewFormulaCast({
        state,
        skillId: "v2c_mage_fireball",
        stages: 1,
      }),
    ).toEqual({ next: state, completes: false });
  });

  it("ignores support and non-magic actions represented by zero stages", () => {
    const state = { stages: 1, seenSkillIds: ["v2c_mage_fireball"] } as const;
    expect(
      previewFormulaCast({
        state,
        skillId: "v2c_mage_meditate",
        stages: 0,
      }),
    ).toEqual({ next: state, completes: false });
  });

  it("uses the existing floor-refund MP rounding with minimum cost 1", () => {
    expect(optimizedMpCost(65, 20)).toBe(52);
    expect(optimizedMpCost(41, 20)).toBe(33);
    expect(optimizedMpCost(1, 20)).toBe(1);
  });

  it("allows zero-MP overdraft only for a completing optimized formula", () => {
    expect(
      canCastWithFormulaMana({
        currentMp: 0,
        normalCost: 52,
        completes: true,
        optimizationEquipped: true,
      }),
    ).toBe(true);
    expect(
      canCastWithFormulaMana({
        currentMp: 0,
        normalCost: 52,
        completes: false,
        optimizationEquipped: true,
      }),
    ).toBe(false);
    expect(
      canCastWithFormulaMana({
        currentMp: 0,
        normalCost: 52,
        completes: true,
        optimizationEquipped: false,
      }),
    ).toBe(false);
  });

  it("offers overdraft only to unseen equipped spells that complete the cycle", () => {
    expect(
      formulaCompletionOverdraftSkillIds({
        state: {
          stages: 2,
          seenSkillIds: ["v2c_mage_fireball"],
        },
        learned: ["v2c_mage_fireball", "v2c_archmage_collapse"],
        equipped: ["v2c_mage_fireball", "v2c_archmage_collapse"],
      }),
    ).toEqual(["v2c_archmage_collapse"]);
  });
});
