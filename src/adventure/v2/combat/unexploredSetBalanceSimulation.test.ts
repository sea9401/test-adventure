import { describe, expect, it } from "vitest";
import {
  SCENARIO_IDS,
  runUnexploredSpecialtySetSimulation,
} from "../../../../scripts/sim-unexplored-specialty-sets";

describe("unexplored specialty set simulation", () => {
  it("비교 대상 9개를 같은 순서로 유지한다", () => {
    expect(SCENARIO_IDS).toEqual([
      "existing_t6_baseline",
      "iron_line_3",
      "triad_decay_3",
      "precision_hunt_3",
      "chain_drive_3",
      "crushing_pressure_3",
      "existing_weapon_3_plus_battle_revenge_3",
      "existing_weapon_3_plus_precision_hunt_3",
      "existing_weapon_3_plus_crushing_pressure_3",
    ]);
  });

  it("같은 seed 설정은 실제 PvE 엔진에서 같은 유한 결과를 만든다", () => {
    const first = runUnexploredSpecialtySetSimulation({
      seedCount: 2,
      actionLimit: 300,
    });
    const second = runUnexploredSpecialtySetSimulation({
      seedCount: 2,
      actionLimit: 300,
    });

    expect(second).toEqual(first);
    expect(first.rows).toHaveLength(9);
    expect(first.rows.every((row) => row.maxActions <= 300)).toBe(true);
    expect(
      first.rows.flatMap((row) => Object.values(row.metrics)).every(Number.isFinite),
    ).toBe(true);
    expect(first.inertnessPassed).toBe(true);
  });
});
