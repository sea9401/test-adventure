import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/server/serverFeed", () => ({ insertFeedEntry: vi.fn() }));
import { huntEquipmentCodexEvents } from "./huntResultEffects";

describe("huntEquipmentCodexEvents", () => {
  it("appends each specialty as ordinary equipment, retaining regular/unique order and duplicates", () => {
    const events = huntEquipmentCodexEvents(
      ["v2_storm_gale_bow"], ["v2_cave_greatsword"],
      ["v2_unexplored_iron_line_armor", "v2_unexplored_iron_line_armor"],
    );
    expect(events).toEqual([
      { category: "equipment", entryId: "v2_storm_gale_bow", amount: 1, source: "equipment.drop" },
      { category: "equipment", entryId: "v2_cave_greatsword", amount: 1, source: "equipment.drop" },
      { category: "equipment", entryId: "v2_unexplored_iron_line_armor", amount: 1, source: "equipment.drop" },
      { category: "equipment", entryId: "v2_unexplored_iron_line_armor", amount: 1, source: "equipment.drop" },
    ]);
  });

  it("preserves callers that omit specialties", () => {
    expect(huntEquipmentCodexEvents([], [])).toEqual([]);
  });
});
