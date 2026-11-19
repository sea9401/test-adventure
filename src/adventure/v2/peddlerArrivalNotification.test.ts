import { describe, expect, it } from "vitest";
import { emptyPeddlerState, startPeddlerDispatch, type PeddlerState } from "./peddler";
import {
  PEDDLER_ARRIVAL_NOTIFICATION_ID,
  acknowledgePeddlerArrivals,
  createPeddlerArrivalNotification,
  emptyPeddlerArrivalNotificationState,
  parsePeddlerArrivalNotificationState,
} from "./peddlerArrivalNotification";
import { FARM_READY_NOTIFICATION_ID } from "./farmReadyNotification";

const WEEK = "2026-11-16";
const NOW = 1_800_000_000_000;
const HOUR = 60 * 60 * 1000;

function sent(state: PeddlerState, routeId: "river" | "ridge" | "harbor", hours: 4 | 8 | 12, now: number) {
  // 교역로 해금 조건과 무관하게 수레 상태만 만든다.
  const unlocked: PeddlerState = {
    ...state,
    routes: {
      river: { ...state.routes.river, standingPoints: 600_000 },
      ridge: { ...state.routes.ridge, standingPoints: 600_000 },
      harbor: { ...state.routes.harbor, standingPoints: 600_000 },
    },
  };
  const result = startPeddlerDispatch(unlocked, { routeId, hours, points: 2_000, preferredPoints: 0, now });
  if ("error" in result) throw new Error(result.error);
  return result.state;
}

describe("행상 도착 알림", () => {
  it("도착한 수레 여러 대를 알림 한 건으로 묶는다", () => {
    let peddler = sent(emptyPeddlerState(WEEK), "river", 4, NOW);
    peddler = sent(peddler, "ridge", 8, NOW);
    peddler = sent(peddler, "harbor", 12, NOW);
    const none = emptyPeddlerArrivalNotificationState();

    expect(createPeddlerArrivalNotification(peddler, none, NOW + 4 * HOUR - 1)).toBeNull();
    expect(createPeddlerArrivalNotification(peddler, none, NOW + 4 * HOUR)).toMatchObject({
      id: PEDDLER_ARRIVAL_NOTIFICATION_ID,
      type: "peddler_arrived",
      payload: { arrivedCount: 1 },
      readAt: null,
      createdAt: NOW + 4 * HOUR,
    });
    // 여러 대가 와 있으면 가장 최근 도착 시각으로 올려 새 도착이 묻히지 않게 한다.
    expect(createPeddlerArrivalNotification(peddler, none, NOW + 9 * HOUR)).toMatchObject({
      payload: { arrivedCount: 2 },
      createdAt: NOW + 8 * HOUR,
    });
  });

  it("농장 수확 알림과 다른 번호를 쓴다", () => {
    expect(PEDDLER_ARRIVAL_NOTIFICATION_ID).not.toBe(FARM_READY_NOTIFICATION_ID);
    expect(PEDDLER_ARRIVAL_NOTIFICATION_ID).toBeLessThan(0);
  });

  it("확인한 수레는 숨기고 그 뒤에 도착한 수레만 다시 알린다", () => {
    let peddler = sent(emptyPeddlerState(WEEK), "river", 4, NOW);
    peddler = sent(peddler, "ridge", 8, NOW);
    const acknowledged = acknowledgePeddlerArrivals(peddler, emptyPeddlerArrivalNotificationState(), NOW + 5 * HOUR);

    expect(acknowledged.acknowledgedCount).toBe(1);
    expect(createPeddlerArrivalNotification(peddler, acknowledged.state, NOW + 5 * HOUR)).toBeNull();
    expect(createPeddlerArrivalNotification(peddler, acknowledged.state, NOW + 8 * HOUR)).toMatchObject({
      payload: { arrivedCount: 1 },
      createdAt: NOW + 8 * HOUR,
    });
  });

  it("같은 교역로로 다시 보낸 수레는 새로 알린다", () => {
    const first = sent(emptyPeddlerState(WEEK), "river", 4, NOW);
    const acknowledged = acknowledgePeddlerArrivals(first, emptyPeddlerArrivalNotificationState(), NOW + 4 * HOUR);
    const second = sent(emptyPeddlerState(WEEK), "river", 4, NOW + 5 * HOUR);

    expect(createPeddlerArrivalNotification(second, acknowledged.state, NOW + 9 * HOUR)).toMatchObject({
      payload: { arrivedCount: 1 },
    });
  });

  it("이미 확인했으면 다시 저장할 것이 없다", () => {
    const peddler = sent(emptyPeddlerState(WEEK), "river", 4, NOW);
    const first = acknowledgePeddlerArrivals(peddler, null, NOW + 4 * HOUR);
    const again = acknowledgePeddlerArrivals(peddler, first.state, NOW + 6 * HOUR);

    expect(again.acknowledgedCount).toBe(0);
    expect(again.state).toEqual(first.state);
  });

  it("받아 간 수레의 확인 기록은 남기지 않는다", () => {
    const peddler = sent(emptyPeddlerState(WEEK), "river", 4, NOW);
    const first = acknowledgePeddlerArrivals(peddler, null, NOW + 4 * HOUR);
    const afterClaim = acknowledgePeddlerArrivals(emptyPeddlerState(WEEK), first.state, NOW + 5 * HOUR);

    expect(afterClaim.state.acknowledgedDispatches).toEqual({});
  });

  it("보낸 수레가 없거나 세이브가 비어 있으면 알리지 않는다", () => {
    expect(createPeddlerArrivalNotification(null, null, NOW)).toBeNull();
    expect(createPeddlerArrivalNotification(emptyPeddlerState(WEEK), null, NOW)).toBeNull();
  });

  it("잘못된 확인 기록은 버린다", () => {
    expect(
      parsePeddlerArrivalNotificationState({
        acknowledgedDispatches: { river: 1_000, unknown: 2_000, ridge: -1, harbor: "3" },
      }),
    ).toEqual({ version: 1, acknowledgedDispatches: { river: 1_000 } });
    expect(parsePeddlerArrivalNotificationState("bad")).toEqual(emptyPeddlerArrivalNotificationState());
  });
});
