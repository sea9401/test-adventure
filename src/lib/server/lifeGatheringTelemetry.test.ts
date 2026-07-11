import { beforeEach, describe, expect, it, vi } from "vitest";

const { recordEconomyEventSoon } = vi.hoisted(() => ({
  recordEconomyEventSoon: vi.fn(),
}));

vi.mock("@/lib/server/economyLog", () => ({ recordEconomyEventSoon }));

import { recordLifeGatheringTelemetrySoon } from "./lifeGatheringTelemetry";

describe("recordLifeGatheringTelemetrySoon", () => {
  beforeEach(() => recordEconomyEventSoon.mockClear());

  it("실패한 시도는 시도 이벤트만 기록한다", () => {
    recordLifeGatheringTelemetrySoon({
      userId: "user-1",
      activity: "woodcutting",
      sourceId: "oak",
      sourceName: "참나무",
      grade: 4,
      success: false,
      failureRate: 0.5,
      xpGained: 0,
      drops: [],
    });

    expect(recordEconomyEventSoon).toHaveBeenCalledTimes(1);
    expect(recordEconomyEventSoon).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        eventType: "life.woodcutting.attempt",
        itemKind: "activity",
        itemId: "oak",
        quantity: 0,
        detail: expect.objectContaining({ success: false, sourceName: "참나무" }),
      }),
    );
  });

  it("성공한 시도는 주 재료와 부산물을 각각 기록한다", () => {
    recordLifeGatheringTelemetrySoon({
      userId: "user-2",
      activity: "mining",
      sourceId: "silver-vein",
      sourceName: "은 광맥",
      grade: 3,
      success: true,
      failureRate: 0.35,
      xpGained: 2,
      drops: [
        { materialId: "silver-ore", quantity: 2, primary: true },
        { materialId: "rough-gem", quantity: 1, primary: false },
        { materialId: "ignored", quantity: 0, primary: false },
      ],
    });

    expect(recordEconomyEventSoon).toHaveBeenCalledTimes(3);
    expect(recordEconomyEventSoon).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ eventType: "life.mining.attempt", quantity: 1 }),
    );
    expect(recordEconomyEventSoon).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        eventType: "life.mining.gather",
        itemId: "silver-ore",
        quantity: 2,
        detail: expect.objectContaining({ primary: true }),
      }),
    );
    expect(recordEconomyEventSoon).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        eventType: "life.mining.gather",
        itemId: "rough-gem",
        quantity: 1,
        detail: expect.objectContaining({ primary: false }),
      }),
    );
  });
});
