import { describe, expect, it } from "vitest";
import {
  aggregateLifeGatheringTelemetry,
  type LifeGatheringTelemetryRow,
} from "./aggregate";

function row(
  values: Partial<LifeGatheringTelemetryRow> &
    Pick<LifeGatheringTelemetryRow, "eventType">,
): LifeGatheringTelemetryRow {
  return {
    userId: "u1",
    gameName: "나무꾼",
    itemId: null,
    quantity: null,
    detail: {},
    createdAt: new Date("2026-07-11T01:00:00.000Z"),
    ...values,
  };
}

describe("aggregateLifeGatheringTelemetry", () => {
  it("활동·대상·재료·유저·일자별로 성공과 수급량을 집계한다", () => {
    const result = aggregateLifeGatheringTelemetry([
      row({
        eventType: "life.woodcutting.attempt",
        itemId: "pine",
        quantity: 1,
        detail: { sourceName: "소나무" },
      }),
      row({
        eventType: "life.woodcutting.gather",
        itemId: "v2_timber",
        quantity: 3,
        detail: { primary: true },
      }),
      row({
        eventType: "life.woodcutting.attempt",
        userId: "u2",
        gameName: "실패자",
        itemId: "pine",
        quantity: 0,
        detail: { sourceName: "소나무" },
      }),
      row({
        eventType: "life.mining.attempt",
        userId: "u3",
        gameName: "광부",
        itemId: "iron",
        quantity: 1,
        detail: { sourceName: "철 광맥" },
        createdAt: new Date("2026-07-12T01:00:00.000Z"),
      }),
      row({
        eventType: "life.mining.gather",
        userId: "u3",
        gameName: "광부",
        itemId: "v2_iron_ore",
        quantity: 2,
        detail: { primary: true },
        createdAt: new Date("2026-07-12T01:00:00.000Z"),
      }),
      row({
        eventType: "life.mining.gather",
        userId: "u3",
        gameName: "광부",
        itemId: "test_gem",
        quantity: 1,
        detail: { primary: false },
        createdAt: new Date("2026-07-12T01:00:00.000Z"),
      }),
    ]);

    expect(result.totals).toEqual({
      attempts: 3,
      successes: 2,
      failures: 1,
      primaryQuantity: 5,
      bonusQuantity: 1,
    });

    const woodcutting = result.activities.find((item) => item.activity === "woodcutting")!;
    expect(woodcutting).toMatchObject({
      attempts: 2,
      successes: 1,
      failures: 1,
      successRate: 50,
      uniqueUsers: 2,
      primaryQuantity: 3,
      bonusQuantity: 0,
    });
    expect(woodcutting.sources).toEqual([
      expect.objectContaining({ name: "소나무", attempts: 2, successes: 1 }),
    ]);
    expect(woodcutting.materials).toEqual([
      expect.objectContaining({ materialId: "v2_timber", quantity: 3, primary: true }),
    ]);
    expect(woodcutting.topUsers[0]).toMatchObject({ userId: "u1", quantity: 3 });

    const mining = result.activities.find((item) => item.activity === "mining")!;
    expect(mining).toMatchObject({
      attempts: 1,
      successes: 1,
      uniqueUsers: 1,
      primaryQuantity: 2,
      bonusQuantity: 1,
    });
    expect(mining.materials).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ materialId: "v2_iron_ore", quantity: 2, primary: true }),
        expect.objectContaining({ materialId: "test_gem", quantity: 1, primary: false }),
      ]),
    );
    expect(mining.daily).toHaveLength(1);
    expect(mining.daily[0]).toMatchObject({
      attempts: 1,
      successes: 1,
      primaryQuantity: 2,
      bonusQuantity: 1,
    });
  });
});
