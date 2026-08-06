import { describe, expect, it, vi } from "vitest";
import { guildActivityLog, guildContributionEvents } from "@/db/schema";
import { logGuildActivity } from "./guildActivityLog";

function transactionDouble() {
  const activityRows: unknown[] = [];
  const contributionRows: unknown[] = [];
  const createdAt = new Date("2026-08-03T03:00:00.000Z");
  const tx = {
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((value: unknown) => {
        if (table === guildActivityLog) {
          activityRows.push(value);
          return {
            returning: vi.fn(async () => [{ id: 17, createdAt }]),
          };
        }
        if (table === guildContributionEvents) {
          contributionRows.push(value);
          return Promise.resolve();
        }
        throw new Error("unexpected table");
      }),
    })),
  };
  return { tx, activityRows, contributionRows, createdAt };
}

describe("길드 활동·기여 원장 동시 기록", () => {
  it("점수가 있는 활동은 같은 트랜잭션에서 기여 이벤트를 남긴다", async () => {
    const fixture = transactionDouble();
    await logGuildActivity(fixture.tx as never, {
      guildId: 7,
      type: "gold_deposit",
      actorUserId: "u1",
      meta: { amount: 250_000 },
    });

    expect(fixture.activityRows).toHaveLength(1);
    expect(fixture.contributionRows).toEqual([
      {
        guildId: 7,
        userId: "u1",
        activityLogId: 17,
        source: "gold_deposit",
        category: "funding",
        points: 25,
        createdAt: fixture.createdAt,
      },
    ]);
  });

  it("공동자산 소비 활동은 활동 내역만 남기고 기여 점수는 만들지 않는다", async () => {
    const fixture = transactionDouble();
    await logGuildActivity(fixture.tx as never, {
      guildId: 7,
      type: "dining_meal",
      actorUserId: "u1",
      meta: { itemName: "길드 대연회" },
    });

    expect(fixture.activityRows).toHaveLength(1);
    expect(fixture.contributionRows).toHaveLength(0);
  });

  it("공동 제작소 주간 의뢰는 수령 기록만 남기고 개인 기여도는 만들지 않는다", async () => {
    const fixture = transactionDouble();
    await logGuildActivity(fixture.tx as never, {
      guildId: 7,
      type: "workshop_weekly_claim",
      actorUserId: "u1",
      meta: {
        questTitle: "전용 장비 제작 3회",
        rewardGold: 900_000,
        rewardFame: 320,
      },
    });

    expect(fixture.activityRows).toHaveLength(1);
    expect(fixture.contributionRows).toHaveLength(0);
  });

  it("교역소 개인 구매는 구매 기록만 남기고 개인 기여도는 만들지 않는다", async () => {
    const fixture = transactionDouble();
    await logGuildActivity(fixture.tx as never, {
      guildId: 7,
      type: "trade_shop_purchase",
      actorUserId: "u1",
      meta: {
        itemName: "정제 철괴",
        quantity: 1,
        tokenCost: 20,
        remainingTokens: 80,
      },
    });

    expect(fixture.activityRows).toHaveLength(1);
    expect(fixture.contributionRows).toHaveLength(0);
  });
});
