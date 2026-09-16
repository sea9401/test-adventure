import { describe, expect, it, vi } from "vitest";
import {
  mutateEmblems, parseEmblemState, rollEmblemDrop, rollEmblemGrowth,
  type Emblem, type EmblemState,
} from "./emblems";

const item = (iid: string, kind: Emblem["kind"] = "hp", grade: Emblem["grade"] = 1): Emblem => ({ iid, kind, grade });
const state = (owned: Emblem[], slots: (string | null)[] = []): EmblemState =>
  parseEmblemState({ owned, slots, revision: 0 });

describe("emblem equipment and fusion", () => {
  it("allows duplicate kinds but only one slot per owned instance", () => {
    let s = state([item("a"), item("b")]);
    s = mutateEmblems(s, { action: "equip", iid: "a", slot: 0, expectedRevision: 0 }).state;
    s = mutateEmblems(s, { action: "equip", iid: "b", slot: 1, expectedRevision: 1 }).state;
    expect(s.slots).toEqual(["a", "b", null, null]);
    s = mutateEmblems(s, { action: "equip", iid: "a", slot: 2, expectedRevision: 2 }).state;
    expect(s.slots).toEqual([null, "b", "a", null]);
    expect(() => mutateEmblems(s, { action: "equip", iid: "missing", slot: 0, expectedRevision: 3 })).toThrow("not_owned");
    expect(() => mutateEmblems(s, { action: "equip", iid: "a", slot: 4, expectedRevision: 3 })).toThrow("invalid_slot");
  });
  it("a failed fusion consumes only the material and keeps the target equipped", () => {
    const before = state([item("target", "hp", 4), item("material", "hp", 4)], ["target"]);
    const result = mutateEmblems(before, { action: "fuse", iid: "target", materialIid: "material", expectedRevision: 0 }, () => 0.02);
    expect(result.success).toBe(false);
    expect(result.state.owned).toEqual([item("target", "hp", 4)]);
    expect(result.state.slots).toEqual(["target", null, null, null]);
    expect(before.owned).toHaveLength(2);
  });
  it("successful fusion upgrades the target and rejects replayed requests", () => {
    const before = state([item("a"), item("b")], ["a"]);
    const request = { action: "fuse", iid: "a", materialIid: "b", expectedRevision: 0 } as const;
    const result = mutateEmblems(before, request, () => 0.349);
    expect(result.success).toBe(true);
    expect(result.state.owned).toEqual([item("a", "hp", 2)]);
    expect(() => mutateEmblems(result.state, request)).toThrow("stale_state");
  });
  it.each([
    [item("a"), item("b", "mp"), [], "invalid_material"],
    [item("a"), item("b", "hp", 2), [], "invalid_material"],
    [item("a"), item("b"), ["b"], "material_equipped"],
    [item("a", "hp", 5), item("b", "hp", 5), [], "max_grade"],
  ] as const)("rejects invalid fusion without consuming or rolling", (a, b, slots, error) => {
    const before = state([a, b], [...slots]);
    const rng = vi.fn();
    expect(() => mutateEmblems(before, { action: "fuse", iid: "a", materialIid: "b", expectedRevision: 0 }, rng)).toThrow(error);
    expect(rng).not.toHaveBeenCalled();
    expect(before.owned).toEqual([a, b]);
  });
  it("rejects using the target as its own material and missing revision", () => {
    const s = state([item("a")]);
    expect(() => mutateEmblems(s, { action: "fuse", iid: "a", materialIid: "a", expectedRevision: 0 })).toThrow("invalid_material");
    expect(() => mutateEmblems(s, { action: "unequip", slot: 0 })).toThrow("stale_state");
  });
  it("normalizes old or malformed state without duplicating items or slots", () => {
    expect(parseEmblemState(null)).toEqual({ owned: [], slots: [null, null, null, null], revision: 0 });
    const s = parseEmblemState({ owned: [item("a"), item("a"), { iid: "b", kind: "hp", grade: 9 }], slots: ["a", "a", "unknown", null, "a"] });
    expect(s.owned).toEqual([item("a")]);
    expect(s.slots).toEqual(["a", null, null, null]);
  });
});

describe("emblem level growth", () => {
  it("rolls independently per equipped instance and actual level, including zero", () => {
    const s = state([item("a", "hp", 5), item("b", "hp", 5), item("c", "mp", 5), item("d", "str", 5)], ["a", "b", "c", "d"]);
    const rng = vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(0.999).mockReturnValueOnce(0.999).mockReturnValueOnce(0.999).mockReturnValue(0);
    expect(rollEmblemGrowth(s, 2, rng)).toEqual({ hp: 30, mp: 18, str: 9, dex: 0, vit: 0, int: 0, spi: 0, luk: 0 });
    expect(rng).toHaveBeenCalledTimes(8);
  });
  it("never rolls for past levels, unequipped inventory, or no actual level-up", () => {
    const s = state([item("a", "hp", 5)], ["a"]);
    const rng = vi.fn(() => 0.999);
    expect(rollEmblemGrowth(s, 0, rng).hp).toBe(0);
    const unequipped = mutateEmblems(s, { action: "unequip", slot: 0, expectedRevision: 0 }).state;
    expect(rollEmblemGrowth(unequipped, 3, rng).hp).toBe(0);
    expect(rng).not.toHaveBeenCalled();
  });
});

describe("emblem rewards", () => {
  it.each([["early_trash", 0.05], ["late_trash", 0.05], ["elite", 0.15], ["guardian", 0.15]] as const)("rolls %s rewards only below its threshold", (kind, threshold) => {
    expect(rollEmblemDrop(kind, "drop", () => threshold)).toBeNull();
    const rng = vi.fn().mockReturnValueOnce(threshold - 0.001).mockReturnValue(0);
    expect(rollEmblemDrop(kind, "drop", rng)).toEqual(item("drop"));
  });
  it.each([[0, 1], [0.88999, 1], [0.89, 2], [0.98999, 2], [0.99, 3], [0.99999, 3]] as const)("guarantees a boss drop and uses grade boundary %s", (roll, grade) => {
    const rng = vi.fn().mockReturnValueOnce(roll).mockReturnValueOnce(0.999);
    expect(rollEmblemDrop("final_boss", "boss", rng)).toEqual(item("boss", "luk", grade));
  });
});
