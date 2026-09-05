import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyFarmState, FARM_SAVE_KEY } from "@/adventure/v2/farm";
import {
  emptyRanchState,
  unlockRanchSlot,
} from "@/adventure/v2/ranch";

const testState = vi.hoisted(() => ({
  rows: [] as Array<{ userId: string; key: string; value: unknown }>,
  deliveredRows: [] as Array<{ eventKey: string }>,
  recordedValues: [] as Array<{ userId: string; eventKey: string }>,
  sendResult: { delivered: 1, failed: 0 },
}));

const sendWebPushToUser = vi.hoisted(() => vi.fn());

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  inArray: vi.fn(),
  lt: vi.fn(),
}));

vi.mock("@/db/schema", () => ({
  pushDeliveries: { createdAt: {}, eventKey: {}, userId: {} },
  pushSubscriptions: { userId: {} },
  savesKv: { key: {}, userId: {}, value: {} },
}));

vi.mock("@/db", () => ({
  db: {
    selectDistinct: vi.fn(() => ({
      from: vi.fn(() => ({
        innerJoin: vi.fn(() => ({
          where: vi.fn(async () => testState.rows),
        })),
      })),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(async () => testState.deliveredRows),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(
        (values: Array<{ userId: string; eventKey: string }>) => {
          testState.recordedValues.push(...values);
          return { onConflictDoNothing: vi.fn(async () => undefined) };
        },
      ),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(async () => undefined),
    })),
  },
}));

vi.mock("@/lib/server/webPush", () => ({
  sendWebPushToUser,
}));

import { sendDueTimedPushNotifications } from "./timedPushNotifications";

const HOUR = 60 * 60 * 1_000;
const START = 1_000;

function completedPigFarm() {
  const ranch = unlockRanchSlot(
    emptyRanchState(START),
    "slot-2",
    "pig",
    100,
    START,
  ).ranch;
  return { ...emptyFarmState(START), ranch };
}

describe("timed ranch push notifications", () => {
  beforeEach(() => {
    testState.rows = [
      {
        userId: "user-1",
        key: FARM_SAVE_KEY,
        value: completedPigFarm(),
      },
    ];
    testState.deliveredRows = [];
    testState.recordedValues = [];
    testState.sendResult = { delivered: 1, failed: 0 };
    sendWebPushToUser.mockReset();
    sendWebPushToUser.mockImplementation(async () => testState.sendResult);
  });

  it("완료된 돼지를 목장 푸시로 보내고 성공한 상태 키를 기록한다", async () => {
    await expect(
      sendDueTimedPushNotifications(START + 12 * HOUR),
    ).resolves.toEqual({ users: 1, candidates: 1, delivered: 1, failed: 0 });

    expect(sendWebPushToUser).toHaveBeenCalledWith("user-1", {
      title: "목장 생산 완료",
      body: "돼지고기를 수확할 수 있습니다.",
      url: "/town/farm#ranch",
      tag: "ranch-ready",
    });
    expect(testState.recordedValues).toEqual([
      {
        userId: "user-1",
        eventKey: "ranch:user-1:pig:1:1",
      },
    ]);
  });

  it("모든 구독 전송이 실패하면 목장 상태 키를 기록하지 않는다", async () => {
    testState.sendResult = { delivered: 0, failed: 1 };

    await expect(
      sendDueTimedPushNotifications(START + 12 * HOUR),
    ).resolves.toEqual({ users: 1, candidates: 1, delivered: 0, failed: 1 });

    expect(sendWebPushToUser).toHaveBeenCalledTimes(1);
    expect(testState.recordedValues).toEqual([]);
  });
});
