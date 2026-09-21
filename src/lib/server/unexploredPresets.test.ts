import { describe, expect, it } from "vitest";
import { parseUnexploredSave, unexploredEarnedPoints } from "@/adventure/data/v2/unexploredState";
import { grantExplorationXp, grantUnexploredAchievements } from "@/adventure/data/v2/unexploredProgression";
import { shortestUnexploredPath } from "@/adventure/data/v2/unexploredTree";
import { prepareUnexploredHunt } from "./unexploredHunt";
import { applyUnexploredMutation, unexploredSnapshot, type UnexploredCharacterSave, type UnexploredMutation } from "./unexploredService";

function legacyCharacter(): UnexploredCharacterSave {
  return {
    level: 100, gold: 1_000_000, bankedGold: 2_000_000,
    unexplored: {
      explorationProgressVersion: 2, explorationXp: 20, xpPoints: 3,
      selectedNodeIds: ["start", "inner-0-0"],
      achievementIds: ["first_unexplored_hunt"], traces: { iron_legion: 7 },
      craftReceipts: [{ requestId: "r1", bossId: "tracking_weapon", craftedAt: 123 }],
    },
  };
}

function apply(character: UnexploredCharacterSave, mutation: UnexploredMutation) {
  const result = applyUnexploredMutation(character, mutation);
  if (!result.ok) throw new Error(result.error);
  return result;
}

describe("independent unexplored presets", () => {
  it("migrates the old allocation into slot 1 and supplies two empty slots", () => {
    const save = parseUnexploredSave(legacyCharacter().unexplored);
    expect(save.activePresetIndex).toBe(0);
    expect(save.nodePresets).toEqual([["start", "inner-0-0"], [], []]);
    expect(parseUnexploredSave(save)).toEqual(save);
    expect(unexploredSnapshot(legacyCharacter())).toMatchObject({
      activePresetIndex: 0, nodePresets: [["start", "inner-0-0"], [], []],
    });
  });

  it("normalizes three slots, drops unknown and duplicate nodes, and uses the active allocation", () => {
    const save = parseUnexploredSave({
      activePresetIndex: 1,
      selectedNodeIds: ["start", "inner-0-1"],
      nodePresets: [["start", "unknown", "start"], ["start"], null, ["start"]],
    });
    expect(save.nodePresets).toEqual([["start"], ["start", "inner-0-1"], []]);
    expect(save.selectedNodeIds).toEqual(["start", "inner-0-1"]);
    expect(parseUnexploredSave({ activePresetIndex: 99 }).activePresetIndex).toBe(0);
  });

  it("switches for free, edits all three slots independently, and restores each allocation", () => {
    const original = legacyCharacter();
    const second = apply(original, { action: "switch_preset", presetIndex: 1 });
    expect(second.snapshot).toMatchObject({
      activePresetIndex: 1, selectedNodeIds: [], spentPoints: 0, earnedPoints: 4,
      gold: 1_000_000, bankedGold: 2_000_000, explorationXp: 20,
      achievementIds: ["first_unexplored_hunt"], traces: { iron_legion: 7 },
    });
    const edited = apply(second.character, {
      action: "activate_path", nodeId: "inner-0-1", expectedPresetIndex: 1,
    });
    expect(edited.snapshot.selectedNodeIds).toEqual(["start", "inner-0-1"]);
    const third = apply(edited.character, {
      action: "switch_preset", presetIndex: 2, expectedPresetIndex: 1,
    });
    const thirdEdited = apply(third.character, {
      action: "activate", nodeId: "start", expectedPresetIndex: 2,
    });
    const first = apply(thirdEdited.character, {
      action: "switch_preset", presetIndex: 0, expectedPresetIndex: 2,
    });
    expect(first.snapshot).toMatchObject({
      selectedNodeIds: ["start", "inner-0-0"],
      nodePresets: [["start", "inner-0-0"], ["start", "inner-0-1"], ["start"]],
      gold: 1_000_000, bankedGold: 2_000_000,
    });
    expect(first.character.unexplored.craftReceipts).toEqual([
      { requestId: "r1", bossId: "tracking_weapon", craftedAt: 123 },
    ]);
    expect(original).toEqual(legacyCharacter());
  });

  it.each(["refund", "refund_path", "reset"] as const)("charges the existing price for %s only inside the active preset", (action) => {
    const source = {
      ...legacyCharacter(),
      unexplored: {
        xpPoints: 3, activePresetIndex: 1,
        selectedNodeIds: ["start", "inner-0-1"],
        nodePresets: [["start", "inner-0-0"], ["start", "inner-0-1"], ["start"]],
      },
    };
    const mutation = action === "reset"
      ? { action, expectedPresetIndex: 1 } as const
      : { action, nodeId: "inner-0-1", expectedPresetIndex: 1 } as const;
    const result = apply(source, mutation);
    expect(result.snapshot).toMatchObject({
      gold: 500_000, bankedGold: 2_000_000, selectedNodeIds: ["start"],
      nodePresets: [["start", "inner-0-0"], ["start"], ["start"]],
    });
    expect(applyUnexploredMutation({ ...source, gold: 0, bankedGold: 499_999 }, mutation))
      .toEqual({ ok: false, error: "insufficient_gold" });
    expect(source.unexplored.nodePresets[1]).toEqual(["start", "inner-0-1"]);
  });

  it("rejects stale edits including old clients instead of resetting another preset", () => {
    const switched = apply(legacyCharacter(), { action: "switch_preset", presetIndex: 1 });
    for (const mutation of [
      { action: "reset" },
      { action: "reset", expectedPresetIndex: 0 },
      { action: "activate", nodeId: "start", expectedPresetIndex: 0 },
      { action: "switch_preset", presetIndex: 2, expectedPresetIndex: 0 },
    ] as UnexploredMutation[]) {
      expect(applyUnexploredMutation(switched.character, mutation))
        .toEqual({ ok: false, error: "preset_changed" });
    }
  });

  it.each([-1, 3, 1.5, NaN, "1"])("rejects invalid preset %s without resetting the tree", (presetIndex) => {
    expect(applyUnexploredMutation(legacyCharacter(), {
      action: "switch_preset", presetIndex,
    } as UnexploredMutation)).toEqual({ ok: false, error: "invalid_preset" });
  });

  it("keeps the point budget independent and enforces it inside each slot", () => {
    const switched = apply({ ...legacyCharacter(), unexplored: { xpPoints: 1, selectedNodeIds: ["start"] } }, {
      action: "switch_preset", presetIndex: 1,
    });
    const opened = apply(switched.character, { action: "activate", nodeId: "start", expectedPresetIndex: 1 });
    expect(opened.snapshot).toMatchObject({ earnedPoints: 1, spentPoints: 1 });
    expect(applyUnexploredMutation(opened.character, { action: "activate", nodeId: "inner-0-1", expectedPresetIndex: 1 }))
      .toEqual({ ok: false, error: "point_limit" });
  });

  it("shares progression gains without replacing inactive allocations", () => {
    const switched = apply(legacyCharacter(), { action: "switch_preset", presetIndex: 1 });
    const xp = grantExplorationXp(switched.character.unexplored, 100_000);
    const grant = grantUnexploredAchievements(xp.save, ["first_special_kill"]);
    const normalized = parseUnexploredSave(grant.save);
    expect(normalized.nodePresets).toEqual([["start", "inner-0-0"], [], []]);
    expect(normalized.activePresetIndex).toBe(1);
    expect(unexploredEarnedPoints(100, normalized)).toBeGreaterThan(4);
    const first = apply({ ...switched.character, unexplored: normalized }, {
      action: "switch_preset", presetIndex: 0, expectedPresetIndex: 1,
    });
    expect(first.snapshot.earnedPoints).toBe(unexploredEarnedPoints(100, normalized));
  });

  it("requires start in the active slot even when another slot has it", () => {
    const switched = apply(legacyCharacter(), { action: "switch_preset", presetIndex: 1 });
    expect(prepareUnexploredHunt(switched.character, () => 0.5)).toEqual({ ok: false, error: "start_required" });
    const restored = apply(switched.character, { action: "switch_preset", presetIndex: 0, expectedPresetIndex: 1 });
    expect(prepareUnexploredHunt(restored.character, () => 0.5).ok).toBe(true);
  });

  it("applies only the active preset's encounter effects to actual hunts", () => {
    const source = {
      ...legacyCharacter(),
      unexplored: {
        xpPoints: 30, selectedNodeIds: shortestUnexploredPath("pool-iron_legion"),
        activePresetIndex: 0, nodePresets: [[], ["start"], []],
      },
    };
    const switched = apply(source, { action: "switch_preset", presetIndex: 1 });
    const hunt = prepareUnexploredHunt(switched.character, () => 0.99);
    expect(hunt).toMatchObject({ ok: true, encounterShares: [{ kind: "base", share: 100 }] });
    const restored = apply(switched.character, { action: "switch_preset", presetIndex: 0, expectedPresetIndex: 1 });
    expect(prepareUnexploredHunt(restored.character, () => 0.99)).toMatchObject({
      ok: true,
      encounterShares: [{ kind: "base", share: 80 }, { kind: "pool", poolId: "iron_legion", share: 20 }],
    });
  });

  it("charges every non-start node on reset and cannot restore refunded nodes by switching", () => {
    const source = {
      ...legacyCharacter(), gold: 1_000_000,
      unexplored: {
        xpPoints: 3, selectedNodeIds: ["start", "inner-0-0", "inner-0-1"],
        activePresetIndex: 2, nodePresets: [["start", "inner-0-0"], [], []],
      },
    };
    const reset = apply(source, { action: "reset", expectedPresetIndex: 2 });
    expect(reset.snapshot).toMatchObject({ gold: 0, nodePresets: [["start", "inner-0-0"], [], ["start"]] });
    const first = apply(reset.character, { action: "switch_preset", presetIndex: 0, expectedPresetIndex: 2 });
    const restored = apply(first.character, { action: "switch_preset", presetIndex: 2 });
    expect(restored.snapshot.selectedNodeIds).toEqual(["start"]);
    expect(restored.snapshot.gold).toBe(0);
  });
});
