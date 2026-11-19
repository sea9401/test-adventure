// 행상 수레 도착 알림. 농장 수확 알림처럼 저장된 알림 행 없이 읽을 때 수레 상태로 만든다.
// 수레를 받아 가면 사라지고, 받지 않고 확인만 한 수레는 확인 기록으로 숨긴다.

import { peddlerActiveDispatches, type PeddlerActiveDispatch } from "@/adventure/v2/peddler";
import { PEDDLER_ROUTES, isPeddlerRouteId, type PeddlerRouteId } from "@/adventure/v2/peddlerRules";
import type { V2NotificationEntry } from "@/lib/v2-notification-config";

export const PEDDLER_ARRIVAL_NOTIFICATION_SAVE_KEY = "peddler-arrival-notification.v1";
// 저장된 알림은 양수, 농장 수확 알림은 0을 쓴다.
export const PEDDLER_ARRIVAL_NOTIFICATION_ID = -1;

export type PeddlerArrivalNotificationState = {
  version: 1;
  /** 교역로별로 확인한 수레의 출발 시각. 같은 교역로로 다시 보낸 수레와 구분한다. */
  acknowledgedDispatches: Partial<Record<PeddlerRouteId, number>>;
};

export function emptyPeddlerArrivalNotificationState(): PeddlerArrivalNotificationState {
  return { version: 1, acknowledgedDispatches: {} };
}

export function parsePeddlerArrivalNotificationState(raw: unknown): PeddlerArrivalNotificationState {
  if (!raw || typeof raw !== "object") return emptyPeddlerArrivalNotificationState();
  const source = (raw as { acknowledgedDispatches?: unknown }).acknowledgedDispatches;
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return emptyPeddlerArrivalNotificationState();
  }
  const acknowledgedDispatches: PeddlerArrivalNotificationState["acknowledgedDispatches"] = {};
  for (const [routeId, startedAt] of Object.entries(source)) {
    if (isPeddlerRouteId(routeId) && typeof startedAt === "number" && Number.isFinite(startedAt) && startedAt > 0) {
      acknowledgedDispatches[routeId] = startedAt;
    }
  }
  return { version: 1, acknowledgedDispatches };
}

function arrivedDispatches(peddlerRaw: unknown, now: number): PeddlerActiveDispatch[] {
  return peddlerActiveDispatches(peddlerRaw).filter(({ dispatch }) => dispatch.readyAt <= now);
}

/** 도착했고 아직 확인하지 않은 수레. 종 알림과 기기 푸시가 같은 기준을 쓴다. */
export function unacknowledgedPeddlerArrivals(
  peddlerRaw: unknown,
  notificationRaw: unknown,
  now = Date.now(),
): PeddlerActiveDispatch[] {
  const acknowledged = parsePeddlerArrivalNotificationState(notificationRaw).acknowledgedDispatches;
  return arrivedDispatches(peddlerRaw, now).filter(
    ({ routeId, dispatch }) => acknowledged[routeId] !== dispatch.startedAt,
  );
}

/** 기기 푸시를 수레마다 한 번만 보내기 위한 키. */
export function peddlerArrivalPushEventKey(userId: string, arrival: PeddlerActiveDispatch): string {
  return `peddler:${userId}:${arrival.routeId}:${arrival.dispatch.startedAt}`;
}

export function peddlerArrivalPushBody(arrivals: readonly PeddlerActiveDispatch[]): string {
  if (arrivals.length === 1) {
    const routeName = PEDDLER_ROUTES.find((route) => route.id === arrivals[0].routeId)?.name ?? "교역로";
    return `${routeName}에 보낸 수레가 돌아왔습니다. 증표를 받으세요.`;
  }
  return `행상 수레 ${arrivals.length}대가 돌아왔습니다. 증표를 받으세요.`;
}

export function createPeddlerArrivalNotification(
  peddlerRaw: unknown,
  notificationRaw: unknown,
  now = Date.now(),
): V2NotificationEntry | null {
  const arrived = unacknowledgedPeddlerArrivals(peddlerRaw, notificationRaw, now);
  if (arrived.length === 0) return null;

  return {
    id: PEDDLER_ARRIVAL_NOTIFICATION_ID,
    type: "peddler_arrived",
    payload: { arrivedCount: arrived.length },
    readAt: null,
    createdAt: Math.max(...arrived.map(({ dispatch }) => dispatch.readyAt)),
  };
}

/** 지금 도착해 있는 수레를 모두 확인한 것으로 기록한다. 받아 간 수레의 기록은 버린다. */
export function acknowledgePeddlerArrivals(
  peddlerRaw: unknown,
  notificationRaw: unknown,
  now = Date.now(),
): { state: PeddlerArrivalNotificationState; acknowledgedCount: number } {
  const previous = parsePeddlerArrivalNotificationState(notificationRaw).acknowledgedDispatches;
  const acknowledgedDispatches: PeddlerArrivalNotificationState["acknowledgedDispatches"] = {};
  let acknowledgedCount = 0;
  for (const { routeId, dispatch } of arrivedDispatches(peddlerRaw, now)) {
    if (previous[routeId] !== dispatch.startedAt) acknowledgedCount += 1;
    acknowledgedDispatches[routeId] = dispatch.startedAt;
  }
  return { state: { version: 1, acknowledgedDispatches }, acknowledgedCount };
}
