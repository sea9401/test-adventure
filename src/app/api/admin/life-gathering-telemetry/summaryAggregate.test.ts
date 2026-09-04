import { describe, expect, it } from "vitest";
import { aggregateLifeGatheringSummary } from "./summaryAggregate";

describe("aggregateLifeGatheringSummary", () => {
  it("DB 전체 기간 집계 행을 기존 관리자 응답 형식으로 조립한다", () => {
    const result = aggregateLifeGatheringSummary({
      activityRows: [
        {
          eventType: "life.woodcutting.attempt",
          attempts: "120000",
          successes: "90000",
          uniqueUsers: "321",
        },
      ],
      sourceRows: [
        {
          eventType: "life.woodcutting.attempt",
          sourceId: "pine",
          sourceName: "소나무",
          attempts: "120000",
          successes: "90000",
        },
      ],
      materialRows: [
        {
          eventType: "life.woodcutting.gather",
          materialId: "v2_timber",
          materialName: null,
          quantity: "270000",
          primary: true,
        },
        {
          eventType: "life.woodcutting.gather",
          materialId: "v2_resin",
          materialName: "송진",
          quantity: "1200",
          primary: false,
        },
      ],
      dailyRows: [
        {
          eventType: "life.woodcutting.attempt",
          day: "2026-09-02",
          attempts: "70000",
          successes: "53000",
          primaryQuantity: "0",
          bonusQuantity: "0",
        },
        {
          eventType: "life.woodcutting.gather",
          day: "2026-09-02",
          attempts: "0",
          successes: "0",
          primaryQuantity: "270000",
          bonusQuantity: "1200",
        },
      ],
      userRows: [
        {
          activity: "woodcutting",
          userId: "user-1",
          gameName: "나무꾼",
          attempts: "70000",
          successes: "53000",
          quantity: "159700",
          activeMinutes: "1440",
          avgIntervalSec: "1.2",
          intervalStddevSec: "0.4",
        },
      ],
    });

    expect(result.totals).toEqual({
      attempts: 120000,
      successes: 90000,
      failures: 30000,
      primaryQuantity: 270000,
      bonusQuantity: 1200,
    });
    const woodcutting = result.activities.find(
      (row) => row.activity === "woodcutting",
    );
    expect(woodcutting).toMatchObject({
      attempts: 120000,
      successes: 90000,
      failures: 30000,
      successRate: 75,
      uniqueUsers: 321,
      primaryQuantity: 270000,
      bonusQuantity: 1200,
    });
    expect(woodcutting?.sources).toEqual([
      expect.objectContaining({
        sourceId: "pine",
        name: "소나무",
        attempts: 120000,
        successes: 90000,
      }),
    ]);
    expect(woodcutting?.daily).toEqual([
      {
        day: "2026-09-02",
        attempts: 70000,
        successes: 53000,
        primaryQuantity: 270000,
        bonusQuantity: 1200,
      },
    ]);
    expect(woodcutting?.topUsers[0]).toMatchObject({
      userId: "user-1",
      attempts: 70000,
      quantity: 159700,
      avgIntervalSec: 1.2,
      intervalStddevSec: 0.4,
    });
  });

  it("숫자가 아닌 집계값과 알 수 없는 이벤트를 안전하게 무시한다", () => {
    const result = aggregateLifeGatheringSummary({
      activityRows: [
        {
          eventType: "unknown.event",
          attempts: "999",
          successes: "999",
          uniqueUsers: "999",
        },
        {
          eventType: "life.fishing.attempt",
          attempts: "not-a-number",
          successes: -3,
          uniqueUsers: 1,
        },
      ],
      sourceRows: [],
      materialRows: [],
      dailyRows: [],
      userRows: [],
    });

    expect(result.totals.attempts).toBe(0);
    expect(result.activities.find((row) => row.activity === "fishing")).toMatchObject({
      attempts: 0,
      successes: 0,
      uniqueUsers: 1,
    });
  });
});
