import { describe, expect, it } from "vitest";
import { buildOpsDailyReport } from "./opsDailyReport";

describe("daily operations report", () => {
  it("이전 원본 행 제한보다 큰 집계값도 줄이지 않고 보고한다", () => {
    const since = new Date("2026-08-12T04:25:00.000Z");

    expect(
      buildOpsDailyReport(
        {
          abuseEvents: 4_321,
          rateLimited: 3_000,
          economyEvents: 9_876,
          goldIn: 9_000_000,
          goldOut: 4_000_000,
          rewardFailures: 7,
          adminActions: 1_234,
          topEconomyEvents: [
            { key: "hunt.reward", count: 8_001 },
          ],
          topAbuseActions: [{ key: "api.rate_limit", count: 3_000 }],
        },
        since,
      ),
    ).toEqual({
      alertType: "ops.daily_report",
      since: "2026-08-12T04:25:00.000Z",
      abuseEvents: 4_321,
      rateLimited: 3_000,
      economyEvents: 9_876,
      goldIn: 9_000_000,
      goldOut: 4_000_000,
      rewardFailures: 7,
      adminActions: 1_234,
      topEconomyEvents: [{ key: "hunt.reward", count: 8_001 }],
      topAbuseActions: [{ key: "api.rate_limit", count: 3_000 }],
    });
  });

  it("PostgreSQL bigint 문자열 집계도 안전한 숫자로 정규화한다", () => {
    const report = buildOpsDailyReport(
      {
        abuseEvents: "10",
        rateLimited: "2",
        economyEvents: "20",
        goldIn: "3000",
        goldOut: "1000",
        rewardFailures: "1",
        adminActions: "4",
        topEconomyEvents: [{ key: "reward", count: "12" }],
        topAbuseActions: [{ key: "rate", count: "2" }],
      },
      new Date(0),
    );

    expect(report).toMatchObject({
      abuseEvents: 10,
      economyEvents: 20,
      goldIn: 3000,
      topEconomyEvents: [{ key: "reward", count: 12 }],
    });
  });

  it("정수로 안전하게 표현할 수 없는 집계는 잘못된 보고 대신 실패한다", () => {
    expect(() =>
      buildOpsDailyReport(
        {
          abuseEvents: "9007199254740992",
          rateLimited: 0,
          economyEvents: 0,
          goldIn: 0,
          goldOut: 0,
          rewardFailures: 0,
          adminActions: 0,
          topEconomyEvents: [],
          topAbuseActions: [],
        },
        new Date(0),
      ),
    ).toThrow("abuseEvents");
  });
});
