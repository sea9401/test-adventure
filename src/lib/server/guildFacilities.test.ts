import { describe, expect, it, vi } from "vitest";
import { PLACEABLE_SETTLEMENT_BUILDING_IDS } from "@/adventure/data/v2/settlement";
import {
  grantGuildBaseFacilities,
  guildFacilityOutpostId,
} from "./guildFacilities";

type Tx = Parameters<typeof grantGuildBaseFacilities>[0];

function transactionWithBuildings(rows: Array<{ buildings: unknown }>) {
  const where = vi.fn(async () => rows);
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  const onConflictDoNothing = vi.fn(async () => undefined);
  const values = vi.fn((_rows: unknown) => ({ onConflictDoNothing }));
  const insert = vi.fn(() => ({ values }));
  return {
    tx: { select, insert } as unknown as Tx,
    insert,
    values,
    onConflictDoNothing,
  };
}

describe("grantGuildBaseFacilities", () => {
  it("새 길드에 모든 길드 시설을 Lv.1로 지급한다", async () => {
    const mocks = transactionWithBuildings([]);

    const granted = await grantGuildBaseFacilities(mocks.tx, 7);

    expect(granted).toEqual(PLACEABLE_SETTLEMENT_BUILDING_IDS);
    expect(mocks.values).toHaveBeenCalledWith(
      PLACEABLE_SETTLEMENT_BUILDING_IDS.map((buildingId) => ({
        outpostId: guildFacilityOutpostId(7, buildingId),
        guildId: 7,
        ownerUserId: null,
        tier: "village",
        name: null,
        productionKind: null,
        unlockedSlots: 1,
        slotKinds: {},
        buildings: { 0: { id: buildingId, level: 1 } },
        jobs: {},
      })),
    );
    expect(mocks.onConflictDoNothing).toHaveBeenCalledOnce();
  });

  it("기존 영지에 있는 시설과 레벨은 보존하고 누락 시설만 지급한다", async () => {
    const mocks = transactionWithBuildings([
      {
        buildings: {
          0: { id: "guild_smithy", level: 4 },
          1: "dining_hall",
        },
      },
    ]);

    const granted = await grantGuildBaseFacilities(mocks.tx, 11);

    expect(granted).not.toContain("guild_smithy");
    expect(granted).not.toContain("dining_hall");
    expect(granted).toHaveLength(PLACEABLE_SETTLEMENT_BUILDING_IDS.length - 2);
    const inserted = mocks.values.mock.calls[0]?.[0] as Array<{
      buildings: Record<number, { id: string; level: number }>;
    }>;
    expect(inserted.map((row) => row.buildings[0].id)).toEqual(granted);
  });

  it("모든 시설이 있으면 추가 행을 만들지 않는다", async () => {
    const mocks = transactionWithBuildings([
      {
        buildings: Object.fromEntries(
          PLACEABLE_SETTLEMENT_BUILDING_IDS.map((buildingId, index) => [
            index,
            { id: buildingId, level: 2 },
          ]),
        ),
      },
    ]);

    await expect(grantGuildBaseFacilities(mocks.tx, 13)).resolves.toEqual([]);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
