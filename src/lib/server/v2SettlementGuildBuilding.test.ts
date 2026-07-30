import { describe, expect, it, vi } from "vitest";
import { lockGuildSettlementBuilding } from "./v2Settlement";

type Tx = Parameters<typeof lockGuildSettlementBuilding>[0];

function transactionWithRows(rows: object[]): Tx {
  const forUpdate = vi.fn(async () => rows);
  const orderBy = vi.fn(() => ({ for: forUpdate }));
  const where = vi.fn(() => ({ orderBy }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  return { select } as unknown as Tx;
}

function villageRow({
  outpostId,
  unlockedSlots,
  buildings,
}: {
  outpostId: string;
  unlockedSlots: number;
  buildings: object;
}) {
  return {
    outpostId,
    guildId: 7,
    ownerUserId: null,
    tier: "village",
    name: "길드 영지",
    productionKind: null,
    unlockedSlots,
    slotKinds: {},
    buildings,
    jobs: {},
  };
}

describe("lockGuildSettlementBuilding", () => {
  it("전용 시설 행이 없어도 기존 길드 영지의 실제 슬롯을 찾는다", async () => {
    const tx = transactionWithRows([
      villageRow({
        outpostId: "occupied-outpost",
        unlockedSlots: 1,
        buildings: { 0: { id: "guild_smithy", level: 3 } },
      }),
    ]);

    const result = await lockGuildSettlementBuilding(tx, 7, "guild_smithy");

    expect(result?.village.outpostId).toBe("occupied-outpost");
    expect(result?.slot).toBe(0);
    expect(result?.village.buildings[0]).toEqual({
      id: "guild_smithy",
      level: 3,
    });
  });

  it("같은 시설이 중복된 옛 데이터에서는 화면에 표시되는 최고 레벨을 고른다", async () => {
    const tx = transactionWithRows([
      villageRow({
        outpostId: "guild-facility:7:guild_smithy",
        unlockedSlots: 1,
        buildings: { 0: { id: "guild_smithy", level: 2 } },
      }),
      villageRow({
        outpostId: "legacy-outpost",
        unlockedSlots: 1,
        buildings: { 0: { id: "guild_smithy", level: 4 } },
      }),
    ]);

    const result = await lockGuildSettlementBuilding(tx, 7, "guild_smithy");

    expect(result?.village.outpostId).toBe("legacy-outpost");
    expect(result?.slot).toBe(0);
  });
});
