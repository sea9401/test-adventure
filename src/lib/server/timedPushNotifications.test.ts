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

describe("timed peddler push notifications", () => {
  const dispatch = (startedAt: number, hours: number) => ({
    hours,
    startedAt,
    readyAt: startedAt + hours * HOUR,
    points: 2_000,
    tokens: 10,
  });

  beforeEach(() => {
    testState.rows = [
      {
        userId: "user-1",
        key: "peddler.v1",
        value: {
          routes: {
            river: { standingPoints: 0, dispatch: dispatch(START, 4) },
            ridge: { standingPoints: 0, dispatch: dispatch(START, 12) },
          },
        },
      },
    ];
    testState.deliveredRows = [];
    testState.recordedValues = [];
    testState.sendResult = { delivered: 1, failed: 0 };
    sendWebPushToUser.mockReset();
    sendWebPushToUser.mockImplementation(async () => testState.sendResult);
  });

  it("도착한 수레만 푸시로 알리고 수레별 상태 키를 기록한다", async () => {
    await expect(
      sendDueTimedPushNotifications(START + 4 * HOUR),
    ).resolves.toEqual({ users: 1, candidates: 1, delivered: 1, failed: 0 });

    expect(sendWebPushToUser).toHaveBeenCalledWith("user-1", {
      title: "행상 수레 도착",
      body: "강나루 장터에 보낸 수레가 돌아왔습니다. 증표를 받으세요.",
      url: "/town/peddler",
      tag: "peddler-arrived",
    });
    expect(testState.recordedValues).toEqual([
      { userId: "user-1", eventKey: `peddler:user-1:river:${START}` },
    ]);
  });

  it("이미 알린 수레는 다시 보내지 않고 새로 도착한 수레만 알린다", async () => {
    testState.deliveredRows = [{ eventKey: `peddler:user-1:river:${START}` }];

    await sendDueTimedPushNotifications(START + 5 * HOUR);
    expect(sendWebPushToUser).not.toHaveBeenCalled();

    await sendDueTimedPushNotifications(START + 12 * HOUR);
    expect(sendWebPushToUser).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        body: "산마루 광산촌에 보낸 수레가 돌아왔습니다. 증표를 받으세요.",
      }),
    );
  });

  it("여러 대가 함께 도착하면 한 번에 묶어 알린다", async () => {
    await sendDueTimedPushNotifications(START + 12 * HOUR);

    expect(sendWebPushToUser).toHaveBeenCalledTimes(1);
    expect(sendWebPushToUser).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ body: "행상 수레 2대가 돌아왔습니다. 증표를 받으세요." }),
    );
    expect(testState.recordedValues).toHaveLength(2);
  });

  it("게임 안에서 이미 확인한 수레는 푸시하지 않는다", async () => {
    testState.rows.push({
      userId: "user-1",
      key: "peddler-arrival-notification.v1",
      value: { version: 1, acknowledgedDispatches: { river: START } },
    });

    await expect(
      sendDueTimedPushNotifications(START + 4 * HOUR),
    ).resolves.toMatchObject({ candidates: 0, delivered: 0 });
    expect(sendWebPushToUser).not.toHaveBeenCalled();
  });
});

describe("timed auto gathering push notifications", () => {
  const session = {
    sessionId: "mine-1",
    planId: "extended",
    sourceId: "copper",
    sourceName: "구리 광맥",
    materialId: "v2_copper_ore",
    startedAt: START,
    readyAt: START + 2 * HOUR,
    durationMs: 2 * HOUR,
    cycleDurationMs: 6_000,
    attempts: 1_200,
    successRate: 0.8,
    materialEfficiency: 0.6,
    xpEfficiency: 0.7,
    bonusMaterialRate: 0,
    baseXp: 6,
  };
  const reservation = {
    next: {
      activity: "woodcutting",
      spotId: "pine_grove",
      planId: "extended",
      sourceId: "pine",
      sourceName: "소나무",
      durationMs: 2 * HOUR,
      reservedAt: START + 60_000,
    },
  };

  beforeEach(() => {
    testState.rows = [{ userId: "user-1", key: "mining-auto.v1", value: { session } }];
    testState.deliveredRows = [];
    testState.recordedValues = [];
    testState.sendResult = { delivered: 1, failed: 0 };
    sendWebPushToUser.mockReset();
    sendWebPushToUser.mockImplementation(async () => testState.sendResult);
  });

  it("예약이 없으면 작업이 끝났을 때 알린다", async () => {
    await sendDueTimedPushNotifications(START + 2 * HOUR);

    expect(sendWebPushToUser).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ title: "자동 채광 완료" }),
    );
    expect(testState.recordedValues).toEqual([
      { userId: "user-1", eventKey: "auto:user-1:mining:mine-1" },
    ]);
  });

  it("예약한 작업이 도는 동안은 앞 작업이 끝났어도 알리지 않는다", async () => {
    testState.rows.push({
      userId: "user-1",
      key: "auto-gathering-reservation.v1",
      value: reservation,
    });

    await sendDueTimedPushNotifications(START + 3 * HOUR);

    expect(sendWebPushToUser).not.toHaveBeenCalled();
  });

  it("예약한 작업까지 끝나면 한 번 알린다", async () => {
    testState.rows.push({
      userId: "user-1",
      key: "auto-gathering-reservation.v1",
      value: reservation,
    });

    await sendDueTimedPushNotifications(START + 4 * HOUR);

    expect(sendWebPushToUser).toHaveBeenCalledTimes(1);
    expect(sendWebPushToUser).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        title: "자동 채집 완료",
        body: "구리 광맥 작업과 예약한 소나무 작업이 끝났습니다. 보상을 정산하세요.",
      }),
    );
    expect(testState.recordedValues).toEqual([
      { userId: "user-1", eventKey: "auto:user-1:mining:mine-1:next" },
    ]);
  });
});
