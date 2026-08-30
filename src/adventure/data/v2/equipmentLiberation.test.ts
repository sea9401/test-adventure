import { describe, expect, it } from "vitest";
import { V2_EQUIPMENT, type V2EquipInstance } from "./v2Equipment";
import {
  canLiberateEquipment,
  liberationOptionValue,
  parseLiberationState,
  rerollLiberation,
  rollInitialLiberation,
} from "./equipmentLiberation";

function sequenceRng(values: number[]): () => number {
  let index = 0;
  return () => values[index++] ?? 0;
}

describe("equipment liberation rolls", () => {
  it.each([
    [0, 1],
    [0.499999, 1],
    [0.5, 2],
    [0.849999, 2],
    [0.85, 3],
    [0.999999, 3],
  ] as const)("maps initial line-count roll %s to %s line(s)", (roll, lines) => {
    const result = rollInitialLiberation(
      "weapon",
      sequenceRng([roll, 0, 0, 0, 0, 0, 0]),
    );
    expect(result.rank).toBe(3);
    expect(result.lineCount).toBe(lines);
    expect(result.options).toHaveLength(lines);
    expect(new Set(result.options.map(({ id }) => id)).size).toBe(lines);
    expect(result.revision).toBe(1);
  });

  it("promotes before drawing option levels and never changes line count", () => {
    const current = {
      rank: 3 as const,
      lineCount: 2 as const,
      revision: 7,
      options: [
        { id: "physical_attack_flat" as const, level: 1 },
        { id: "magic_attack_flat" as const, level: 1 },
      ],
    };
    const promoted = rerollLiberation(
      "weapon",
      current,
      sequenceRng([0.049999, 0, 0, 0, 0]),
    );

    expect(promoted).toMatchObject({ rank: 2, lineCount: 2, revision: 8 });
    expect(promoted.options.every(({ level }) => level >= 5 && level <= 10)).toBe(
      true,
    );

    const stayed = rerollLiberation(
      "weapon",
      current,
      sequenceRng([0.05, 0, 0, 0, 0]),
    );
    expect(stayed.rank).toBe(3);
    expect(stayed.options.every(({ level }) => level >= 1 && level <= 5)).toBe(
      true,
    );
  });

  it("uses the approved level distribution boundaries", () => {
    const rank3 = { rank: 3 as const, lineCount: 1 as const, revision: 1, options: [] };
    const rank2 = { rank: 2 as const, lineCount: 1 as const, revision: 1, options: [] };
    const rank1 = { rank: 1 as const, lineCount: 1 as const, revision: 1, options: [] };

    expect(rerollLiberation("weapon", rank3, sequenceRng([0.9, 0, 0.239999])).options[0].level).toBe(1);
    expect(rerollLiberation("weapon", rank3, sequenceRng([0.9, 0, 0.24])).options[0].level).toBe(2);
    expect(rerollLiberation("weapon", rank2, sequenceRng([0.9, 0, 0.189999])).options[0].level).toBe(5);
    expect(rerollLiberation("weapon", rank2, sequenceRng([0.9, 0, 0.19])).options[0].level).toBe(6);
    expect(rerollLiberation("weapon", rank1, sequenceRng([0, 0.509999])).options[0].level).toBe(14);
    expect(rerollLiberation("weapon", rank1, sequenceRng([0, 0.51])).options[0].level).toBe(15);
    expect(rerollLiberation("weapon", rank1, sequenceRng([0, 0.939999])).options[0].level).toBe(19);
    expect(rerollLiberation("weapon", rank1, sequenceRng([0, 0.94])).options[0].level).toBe(20);
  });

  it("scales integer and percentage values linearly", () => {
    expect(liberationOptionValue("physical_attack_flat", 1)).toBe(5);
    expect(liberationOptionValue("accuracy_flat", 1)).toBe(3);
    expect(liberationOptionValue("speed_flat", 1)).toBe(1);
    expect(liberationOptionValue("base_str_pct", 1)).toBe(0.45);
    expect(liberationOptionValue("crit_damage_pp", 20)).toBe(60);
  });
});

describe("equipment liberation validation", () => {
  it("accepts true 6T equipment and rejects storm-refined lower-tier equipment", () => {
    const trueTier6 = V2_EQUIPMENT.v2_storm_breaker_greatsword;
    const lowerTier = V2_EQUIPMENT.v2_iron_sword;
    const instance = { iid: "one", id: trueTier6.id } satisfies V2EquipInstance;

    expect(canLiberateEquipment(trueTier6, instance)).toBe(true);
    expect(
      canLiberateEquipment(lowerTier, {
        iid: "two",
        id: lowerTier.id,
        stormRefined: true,
      }),
    ).toBe(false);
  });

  it("rejects malformed, duplicate, wrong-slot, and out-of-range saved rolls", () => {
    expect(parseLiberationState(null, "weapon")).toBeUndefined();
    expect(
      parseLiberationState(
        {
          rank: 3,
          lineCount: 2,
          revision: 1,
          options: [
            { id: "physical_attack_flat", level: 1 },
            { id: "physical_attack_flat", level: 2 },
          ],
        },
        "weapon",
      ),
    ).toBeUndefined();
    expect(
      parseLiberationState(
        {
          rank: 2,
          lineCount: 1,
          revision: 2,
          options: [{ id: "max_hp_flat", level: 8 }],
        },
        "weapon",
      ),
    ).toBeUndefined();
    expect(
      parseLiberationState(
        {
          rank: 2,
          lineCount: 1,
          revision: 2,
          options: [{ id: "physical_attack_flat", level: 11 }],
        },
        "weapon",
      ),
    ).toBeUndefined();
  });

  it("preserves a valid saved roll exactly", () => {
    expect(
      parseLiberationState(
        {
          rank: 1,
          lineCount: 2,
          revision: 14,
          options: [
            { id: "all_damage_pct", level: 20 },
            { id: "physical_attack_pct", level: 17 },
          ],
        },
        "weapon",
      ),
    ).toEqual({
      rank: 1,
      lineCount: 2,
      revision: 14,
      options: [
        { id: "all_damage_pct", level: 20 },
        { id: "physical_attack_pct", level: 17 },
      ],
    });
  });
});
