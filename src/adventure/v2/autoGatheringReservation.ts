// 자동 채집 다음 작업 예약 — 지금 작업이 끝난 시각부터 이어서 시작할 작업 1건.
// 순수 로직만 둔다. 세이브 읽기·쓰기와 세션 만들기는 서버 쪽(`autoGatheringReservation` 서버 모듈)이 맡는다.

import {
  autoGatheringPlan,
  isAutoGatheringPlanId,
  sessionDurationMs,
  type AutoGatheringActivity,
  type AutoGatheringNextStatus,
  type AutoGatheringPlanId,
  type AutoGatheringStatus,
} from "./autoGathering";

export const AUTO_GATHERING_RESERVATION_KEY = "auto-gathering-reservation.v1";

export type AutoGatheringReservation = {
  activity: AutoGatheringActivity;
  spotId: string;
  planId: AutoGatheringPlanId;
  sourceId: string;
  sourceName: string;
  /** 예약할 때 굳힌 작업 시간. 그 뒤에 채집지를 정비해도 이 예약은 길어지지 않는다. */
  durationMs: number;
  reservedAt: number;
};

export type AutoGatheringReservationState = {
  next: AutoGatheringReservation | null;
};

export const EMPTY_AUTO_GATHERING_RESERVATION: AutoGatheringReservationState = {
  next: null,
};

function isActivity(value: unknown): value is AutoGatheringActivity {
  return value === "woodcutting" || value === "mining";
}

function reservationDurationMs(raw: unknown, planId: AutoGatheringPlanId): number {
  // 기본 작업은 시간이 고정이다. 느긋한 작업만 정비 단계에 따라 길어진다.
  return planId === "extended"
    ? sessionDurationMs(raw, planId)
    : autoGatheringPlan(planId).durationMs;
}

export function createAutoGatheringReservation(args: {
  activity: AutoGatheringActivity;
  spotId: string;
  planId: AutoGatheringPlanId;
  sourceId: string;
  sourceName: string;
  durationMs: number;
  reservedAt: number;
}): AutoGatheringReservation {
  return {
    activity: args.activity,
    spotId: args.spotId,
    planId: args.planId,
    sourceId: args.sourceId,
    sourceName: args.sourceName,
    durationMs: reservationDurationMs(args.durationMs, args.planId),
    reservedAt: Math.floor(args.reservedAt),
  };
}

function parseReservation(raw: unknown): AutoGatheringReservation | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const reservedAt = Number(item.reservedAt);
  if (
    !isActivity(item.activity) ||
    typeof item.spotId !== "string" ||
    !item.spotId ||
    typeof item.sourceId !== "string" ||
    !item.sourceId ||
    !Number.isFinite(reservedAt)
  ) {
    return null;
  }
  const planId = isAutoGatheringPlanId(item.planId) ? item.planId : "standard";
  return createAutoGatheringReservation({
    activity: item.activity,
    spotId: item.spotId,
    planId,
    sourceId: item.sourceId,
    sourceName: typeof item.sourceName === "string" ? item.sourceName : "작업 장소",
    durationMs: Number(item.durationMs),
    reservedAt,
  });
}

export function parseAutoGatheringReservationState(
  raw: unknown,
): AutoGatheringReservationState {
  if (!raw || typeof raw !== "object") return { next: null };
  return { next: parseReservation((raw as Record<string, unknown>).next) };
}

/** 응답에 실린 예약을 화면용으로 읽는다. 기기 시계가 서버와 다르면 서버 기준으로 보정한다. */
export function parseAutoGatheringReservationView(
  raw: unknown,
  options: { serverNow?: unknown; clientNow?: number } = {},
): AutoGatheringReservation | null {
  const reservation = parseReservation(raw);
  if (!reservation) return null;
  const serverNow = options.serverNow;
  if (typeof serverNow !== "number" || !Number.isFinite(serverNow)) {
    return reservation;
  }
  const clientNow = options.clientNow ?? Date.now();
  return {
    ...reservation,
    reservedAt: Math.floor(reservation.reservedAt + (clientNow - serverNow)),
  };
}

/** 예약한 작업이 시작한 것으로 보는 시각. 지금 작업이 끝난 뒤에 건 예약은 예약한 시각부터다. */
export function reservationStartAt(
  currentReadyAt: number,
  reservation: AutoGatheringReservation,
): number {
  return Math.max(Math.floor(currentReadyAt), reservation.reservedAt);
}

export function reservationReadyAt(
  currentReadyAt: number,
  reservation: AutoGatheringReservation,
): number {
  return reservationStartAt(currentReadyAt, reservation) + reservation.durationMs;
}

export function autoGatheringNextStatus(
  currentReadyAt: number,
  reservation: AutoGatheringReservation | null,
): AutoGatheringNextStatus | undefined {
  if (!reservation) return undefined;
  return {
    activity: reservation.activity,
    sourceName: reservation.sourceName,
    readyAt: reservationReadyAt(currentReadyAt, reservation),
  };
}

/** 정산을 재촉해도 되는 시각. 예약이 있으면 예약한 작업까지 끝난 때다. */
export function autoGatheringPromptReadyAt(
  status: Pick<AutoGatheringStatus, "readyAt" | "next">,
): number {
  return status.next ? Math.max(status.readyAt, status.next.readyAt) : status.readyAt;
}

export function autoGatheringReservationLabel(
  reservation: AutoGatheringReservation,
  durationLabel: string,
): string {
  const activityName = reservation.activity === "woodcutting" ? "벌목" : "채광";
  return `${activityName} · ${reservation.sourceName} · ${durationLabel}`;
}
