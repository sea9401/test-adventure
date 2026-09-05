import { describe, expect, it } from "vitest";
import {
  UNEXPLORED_SIMULATION_DIFFICULTIES,
  UNEXPLORED_SPEED_BANDS,
  unexploredAttackCompensation,
  unexploredCalibratedActionRatio,
  unexploredHighDifficultyMultipliers,
  unexploredRawSpd,
  unexploredResourceGrowthCompensation,
  unexploredTempoRows,
} from "./unexploredSimulationBalance";

describe("unexplored simulation balance", () => {
  it("maps every approved speed band to literal raw monster speed", () => {
    expect(unexploredRawSpd(90, "slow")).toBe(10);
    expect(unexploredRawSpd(90, "normal")).toBe(15);
    expect(unexploredRawSpd(90, "fast")).toBe(42);
    expect(unexploredRawSpd(90, "extreme")).toBe(62);
    expect(unexploredRawSpd(95, "slow")).toBe(13);
    expect(unexploredRawSpd(95, "normal")).toBe(20);
    expect(unexploredRawSpd(95, "fast")).toBe(54);
    expect(unexploredRawSpd(95, "extreme")).toBe(83);
    expect(unexploredRawSpd(100, "slow")).toBe(17);
    expect(unexploredRawSpd(100, "normal")).toBe(27);
    expect(unexploredRawSpd(100, "fast")).toBe(71);
    expect(unexploredRawSpd(100, "extreme")).toBe(107);
    expect(unexploredRawSpd(105, "extreme")).toBe(116);
    expect(unexploredRawSpd(110, "extreme")).toBe(122);
    expect(unexploredRawSpd(115, "extreme")).toBe(126);
    expect(unexploredRawSpd(120, "extreme")).toBe(129);
    expect(unexploredRawSpd(101, "normal")).toBe(28);
    expect(unexploredRawSpd(119, "normal")).toBe(38);
  });

  it("tapers speed growth after 100 without slowing a band down", () => {
    for (const band of UNEXPLORED_SPEED_BANDS) {
      const ratios = UNEXPLORED_SIMULATION_DIFFICULTIES.map((difficulty) =>
        unexploredCalibratedActionRatio(difficulty, band),
      );
      for (let index = 1; index < ratios.length; index += 1) {
        expect(ratios[index], band).toBeLessThanOrEqual(ratios[index - 1]);
      }
      expect(ratios.at(-1), band).toBeLessThan(ratios[2]);

      const highDifficultySpeeds = [100, 105, 110, 115, 120].map(
        (difficulty) => unexploredRawSpd(difficulty, band),
      );
      const increments = highDifficultySpeeds.slice(1).map(
        (speed, index) => speed - highDifficultySpeeds[index],
      );
      for (let index = 1; index < increments.length; index += 1) {
        expect(increments[index], band).toBeLessThanOrEqual(
          increments[index - 1],
        );
      }
    }
  });

  it("adds a continuous numerical pressure overlay only after 100", () => {
    expect(UNEXPLORED_SIMULATION_DIFFICULTIES).toEqual([
      90, 95, 100, 105, 110, 115, 120,
    ]);
    expect(unexploredHighDifficultyMultipliers(95)).toEqual({
      hp: 1,
      atk: 1,
      def: 1,
    });
    expect(unexploredHighDifficultyMultipliers(100)).toEqual({
      hp: 1,
      atk: 1,
      def: 1,
    });
    expect(unexploredHighDifficultyMultipliers(110)).toEqual({
      hp: 2.625,
      atk: 2.0625,
      def: 1.1,
    });
    expect(unexploredHighDifficultyMultipliers(120)).toEqual({
      hp: 7,
      atk: 4.5,
      def: 1.3,
    });
  });

  it("compensates only the entry band for the deployed life-resource growth", () => {
    expect(unexploredResourceGrowthCompensation(90)).toEqual({
      hp: 1,
      atk: 1,
      def: 1,
    });
    expect(unexploredResourceGrowthCompensation(95)).toEqual({
      hp: 1.75,
      atk: 1.5,
      def: 1.12,
    });
    expect(unexploredResourceGrowthCompensation(97)).toEqual({
      hp: 1.81,
      atk: 1.52,
      def: 1.128,
    });
    expect(unexploredResourceGrowthCompensation(100)).toEqual({
      hp: 1.9,
      atk: 1.55,
      def: 1.14,
    });
    expect(unexploredResourceGrowthCompensation(105)).toEqual({
      hp: 1.3,
      atk: 1.18,
      def: 1.06,
    });
    expect(unexploredResourceGrowthCompensation(107)).toEqual({
      hp: 1.18,
      atk: 1.108,
      def: 1.036,
    });
    expect(unexploredResourceGrowthCompensation(110)).toEqual({
      hp: 1,
      atk: 1,
      def: 1,
    });
    expect(unexploredResourceGrowthCompensation(120)).toEqual({
      hp: 1,
      atk: 1,
      def: 1,
    });
  });

  it("rejects unsupported unexplored difficulty values", () => {
    expect(() => unexploredRawSpd(89, "normal")).toThrow(
      "Unsupported unexplored difficulty: 89",
    );
    expect(() => unexploredRawSpd(100.5, "normal")).toThrow(
      "Unsupported unexplored difficulty: 100.5",
    );
    expect(() => unexploredHighDifficultyMultipliers(121)).toThrow(
      "Unsupported unexplored difficulty: 121",
    );
    expect(() => unexploredResourceGrowthCompensation(89)).toThrow(
      "Unsupported unexplored difficulty: 89",
    );
  });

  it("matches the approved action ratios against player speed 930", () => {
    expect(unexploredCalibratedActionRatio(90, "normal")).toBeCloseTo(
      94 / 22,
      10,
    );
    expect(unexploredCalibratedActionRatio(100, "fast")).toBeCloseTo(
      37 / 22,
      10,
    );
  });

  it("reduces per-hit attack as action frequency rises", () => {
    expect(unexploredAttackCompensation(90, "normal")).toBeCloseTo(
      0.8469232367361785,
      12,
    );
    expect(unexploredAttackCompensation(100, "extreme")).toBeCloseTo(
      0.27452353300006144,
      12,
    );
    expect(unexploredAttackCompensation(100, "extreme")).toBeLessThan(
      unexploredAttackCompensation(100, "slow"),
    );
  });

  it("reports every calibrated tempo in stable display order", () => {
    const rows = unexploredTempoRows();

    expect(rows).toHaveLength(28);
    expect(rows[0]).toEqual({
      difficulty: 90,
      band: "slow",
      rawSpd: 10,
      playerActionsPerMonsterAction: 112 / 22,
    });
    expect(rows.at(-1)).toEqual({
      difficulty: 120,
      band: "extreme",
      rawSpd: 129,
      playerActionsPerMonsterAction: 25 / 22,
    });
  });
});
