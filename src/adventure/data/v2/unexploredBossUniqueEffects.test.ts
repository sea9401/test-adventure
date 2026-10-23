import { describe, expect, it } from "vitest";
import { UNEXPLORED_BOSSES } from "./unexploredBosses";
import {
  collectUnexploredBossUniqueEffects,
  UNEXPLORED_BOSS_UNIQUE_EFFECTS,
  unexploredBossUniqueEffectOf,
} from "./unexploredBossUniqueEffects";
import type { V2EquipmentId } from "./v2Equipment";

const BOSS_UNIQUE_IDS = Object.values(UNEXPLORED_BOSSES).flatMap((boss) =>
  boss.uniqueDrops.map((drop) => drop.equipmentId),
);

describe("unexplored boss unique effects", () => {
  it("gives every boss unique exactly one distinct effect", () => {
    expect(BOSS_UNIQUE_IDS).toHaveLength(18);
    expect(new Set(Object.keys(UNEXPLORED_BOSS_UNIQUE_EFFECTS))).toEqual(
      new Set(BOSS_UNIQUE_IDS),
    );
    const kinds = Object.values(UNEXPLORED_BOSS_UNIQUE_EFFECTS).map((e) => e.kind);
    expect(new Set(kinds).size).toBe(18);
    for (const effect of Object.values(UNEXPLORED_BOSS_UNIQUE_EFFECTS)) {
      expect(effect.label.length).toBeGreaterThan(0);
      expect(effect.description).not.toMatch(/[*#`—–]/);
    }
  });

  it("looks up effects by equipment id", () => {
    expect(unexploredBossUniqueEffectOf("v2_unexplored_eternal_life_core")).toMatchObject({
      kind: "eternal_life",
      label: "영겁",
    });
    expect(unexploredBossUniqueEffectOf("v2_unexplored_iron_line_armor")).toBeUndefined();
  });

  it("collects each equipped effect once", () => {
    const equipped: Partial<Record<string, V2EquipmentId>> = {
      weapon: "v2_unexplored_tracking_blade_dagger",
      necklace: "v2_unexplored_absolute_zero_core",
      ring: "v2_unexplored_iron_line_armor" as V2EquipmentId,
    };
    expect(collectUnexploredBossUniqueEffects(equipped)).toEqual([
      "tracking_edge",
      "absolute_zero",
    ]);
    expect(collectUnexploredBossUniqueEffects({})).toEqual([]);
  });
});
