import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rows: [] as Array<{ key: string; value: unknown }>,
  select: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: mocks.select,
  },
}));

import {
  marketplaceSellOverviewFromSaves,
  readMarketplaceSellOverview,
} from "./marketplaceSellOverview";

const NOW = Date.UTC(2026, 8, 10, 3);

describe("marketplace sell overview", () => {
  beforeEach(() => {
    mocks.rows = [];
    mocks.select.mockReset();
    mocks.select.mockImplementation(() => {
      const chain = {
        from: () => chain,
        where: async () => mocks.rows,
      };
      return chain;
    });
  });

  it("판매 화면에 필요한 장비·재료·지도·캐시품·표본을 한 payload로 조립한다", () => {
    const overview = marketplaceSellOverviewFromSaves(
      {
        "equipment.v2": {
          owned: [{ iid: "sword-1", id: "v2_iron_sword" }],
          equipped: { weapon: "sword-1" },
        },
        "character.v2": {
          materials: { v2_iron_ore: 4, invalid_material: 99 },
          rareMaps: [
            { iid: "map-1", kind: "worn_map", depth: 3, runsLeft: 2, foundAt: NOW - 1_000 },
          ],
          cashItems: { rename_permit: 2, invalid_item: 10 },
        },
        "inventory.v2": {},
        "farm.v2": {},
        "fishing-stock.v1": {},
        "cooking.v2": {},
        "fishing-specimens.v1": { items: { minnow: 3, invalid_fish: 9 } },
      },
      NOW,
    );

    expect(overview.owned).toEqual([{ iid: "sword-1", id: "v2_iron_sword" }]);
    expect(overview.equipped).toEqual({ weapon: "sword-1" });
    expect(overview.materials).toMatchObject({ v2_iron_ore: 4 });
    expect(overview.rareMaps).toHaveLength(1);
    expect(overview.cashItems).toEqual({ rename_permit: 2 });
    expect(overview.specimens).toEqual({ minnow: 3 });
  });

  it("필요한 save를 SELECT 한 번으로 읽는다", async () => {
    mocks.rows = [
      { key: "character.v2", value: { materials: { v2_iron_ore: 2 } } },
    ];

    const overview = await readMarketplaceSellOverview("user-1", NOW);

    expect(mocks.select).toHaveBeenCalledTimes(1);
    expect(overview.materials).toMatchObject({ v2_iron_ore: 2 });
  });
});
