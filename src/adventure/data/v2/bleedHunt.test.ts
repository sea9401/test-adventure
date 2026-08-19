import { describe, expect, it } from "vitest";
import {
  BLEED_HUNT_UPTIME_10,
  BLEED_HUNT_UPTIME_5,
  bleedHuntPowerValue,
  bleedHuntStage,
  bleedHuntStageLabel,
} from "./bleedHunt";

describe("bleed hunt shared rules", () => {
  it.each([
    [0, null, null],
    [4, null, null],
    [5, "tracking", "추적"],
    [9, "tracking", "추적"],
    [10, "apex", "사냥의 절정"],
    [99, "apex", "사냥의 절정"],
  ] as const)("%i stacks derives %s", (stacks, stage, label) => {
    expect(bleedHuntStage(stacks)).toBe(stage);
    expect(bleedHuntStageLabel(stage)).toBe(label);
  });

  it("uses the approved conditional uptimes", () => {
    expect(BLEED_HUNT_UPTIME_5).toBe(0.55);
    expect(BLEED_HUNT_UPTIME_10).toBe(0.3);
  });

  it("prices stronger values upward and rarer thresholds downward", () => {
    expect(
      bleedHuntPowerValue({ minStacks: 10, directPhysicalDamagePct: 12 }),
    ).toBeGreaterThan(
      bleedHuntPowerValue({ minStacks: 10, directPhysicalDamagePct: 6 }),
    );
    expect(
      bleedHuntPowerValue({ minStacks: 5, directPhysicalAccuracyPct: 8 }),
    ).toBeGreaterThan(
      bleedHuntPowerValue({ minStacks: 10, directPhysicalAccuracyPct: 8 }),
    );
    expect(
      bleedHuntPowerValue({
        minStacks: 10,
        directPhysicalHitBleedExtend: {
          chancePct: 60,
          turns: 1,
          maxTurns: 4,
        },
      }),
    ).toBeGreaterThan(
      bleedHuntPowerValue({
        minStacks: 10,
        directPhysicalHitBleedExtend: {
          chancePct: 30,
          turns: 1,
          maxTurns: 4,
        },
      }),
    );
  });
});
