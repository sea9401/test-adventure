import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/server/serverFeed", () => ({ insertFeedEntry: vi.fn() }));
import { huntEquipmentCodexEvents } from "./huntResultEffects";

describe("huntEquipmentCodexEvents", () => {
  it("retains regular and unique equipment order and duplicates", () => {
    const events = huntEquipmentCodexEvents(
      ["v2_storm_gale_bow", "v2_storm_gale_bow"],
      ["v2_cave_greatsword"],
    );
    expect(events).toEqual([
      { category: "equipment", entryId: "v2_storm_gale_bow", amount: 1, source: "equipment.drop" },
      { category: "equipment", entryId: "v2_storm_gale_bow", amount: 1, source: "equipment.drop" },
      { category: "equipment", entryId: "v2_cave_greatsword", amount: 1, source: "equipment.drop" },
    ]);
  });

  it("handles empty equipment results", () => {
    expect(huntEquipmentCodexEvents([], [])).toEqual([]);
  });
});
