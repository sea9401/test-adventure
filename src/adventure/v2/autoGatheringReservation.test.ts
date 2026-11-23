import { describe, expect, it } from "vitest";
import { autoGatheringStatusDisplay } from "./autoGathering";
import {
  autoGatheringNextStatus,
  autoGatheringPromptReadyAt,
  createAutoGatheringReservation,
  parseAutoGatheringReservationState,
  parseAutoGatheringReservationView,
  reservationReadyAt,
  reservationStartAt,
} from "./autoGatheringReservation";

const HOUR = 60 * 60 * 1_000;

const reservation = createAutoGatheringReservation({
  activity: "woodcutting",
  spotId: "pine_forest",
  planId: "extended",
  sourceId: "pine",
  sourceName: "소나무",
  durationMs: 2 * HOUR,
  reservedAt: 1_000_000,
});

describe("자동 채집 다음 작업 예약", () => {
  it("지금 작업이 끝난 시각부터 예약 작업이 시작된 것으로 계산한다", () => {
    const currentReadyAt = 1_000_000 + HOUR;
    expect(reservationStartAt(currentReadyAt, reservation)).toBe(currentReadyAt);
    expect(reservationReadyAt(currentReadyAt, reservation)).toBe(
      currentReadyAt + 2 * HOUR,
    );
  });

  it("지금 작업이 끝난 뒤에 건 예약은 예약한 시각부터 시작한다", () => {
    const currentReadyAt = 400_000;
    expect(reservationStartAt(currentReadyAt, reservation)).toBe(1_000_000);
    expect(reservationReadyAt(currentReadyAt, reservation)).toBe(
      1_000_000 + 2 * HOUR,
    );
  });

  it("세이브를 읽고, 모양이 틀리면 예약 없음으로 본다", () => {
    expect(parseAutoGatheringReservationState({ next: reservation }).next).toEqual(
      reservation,
    );
    expect(parseAutoGatheringReservationState(null).next).toBeNull();
    expect(parseAutoGatheringReservationState({ next: null }).next).toBeNull();
    expect(
      parseAutoGatheringReservationState({
        next: { ...reservation, activity: "fishing" },
      }).next,
    ).toBeNull();
    expect(
      parseAutoGatheringReservationState({
        next: { ...reservation, spotId: "" },
      }).next,
    ).toBeNull();
  });

  it("작업 시간은 계획의 기본 시간과 느긋한 작업 상한 사이로 맞춘다", () => {
    expect(
      parseAutoGatheringReservationState({
        next: { ...reservation, durationMs: 99 * HOUR },
      }).next?.durationMs,
    ).toBe(2 * HOUR);
    expect(
      parseAutoGatheringReservationState({
        next: { ...reservation, planId: "standard", durationMs: 5 * HOUR },
      }).next?.durationMs,
    ).toBe(30 * 60 * 1_000);
    expect(
      parseAutoGatheringReservationState({
        next: { ...reservation, durationMs: 3.5 * HOUR },
      }).next?.durationMs,
    ).toBe(3.5 * HOUR);
  });

  it("기기 시계가 달라도 화면용 예약 시각을 서버 기준으로 보정한다", () => {
    expect(
      parseAutoGatheringReservationView(reservation, {
        serverNow: 1_000_500,
        clientNow: 9_000_500,
      })?.reservedAt,
    ).toBe(9_000_000);
    expect(parseAutoGatheringReservationView(null)).toBeNull();
  });
});

describe("예약이 있을 때의 상태 표시", () => {
  const currentReadyAt = 1_000_000 + HOUR;
  const status = {
    activity: "mining" as const,
    sourceId: "copper",
    sourceName: "구리 광맥",
    readyAt: currentReadyAt,
    next: autoGatheringNextStatus(currentReadyAt, reservation),
  };

  it("재촉 기준 시각은 예약한 작업까지 끝나는 때다", () => {
    expect(autoGatheringPromptReadyAt(status)).toBe(currentReadyAt + 2 * HOUR);
    expect(autoGatheringPromptReadyAt({ ...status, next: undefined })).toBe(
      currentReadyAt,
    );
  });

  it("지금 작업이 도는 동안은 지금 작업을 보여 준다", () => {
    expect(autoGatheringStatusDisplay(status, currentReadyAt - 60_000)).toEqual({
      text: "채광 자동 중 · 구리 광맥 · 1:00",
      contextLabel: "채광 자동 중 · 구리 광맥",
      stateLabel: "남은 1:00",
    });
  });

  it("지금 작업이 끝나고 예약 작업이 도는 동안은 예약 작업의 남은 시간을 보여 준다", () => {
    expect(autoGatheringStatusDisplay(status, currentReadyAt + HOUR)).toEqual({
      text: "예약한 벌목 진행 중 · 소나무 · 1:00:00",
      contextLabel: "예약한 벌목 진행 중 · 소나무",
      stateLabel: "남은 1:00:00",
    });
  });

  it("예약 작업까지 끝나면 정산 대기로 바뀐다", () => {
    expect(
      autoGatheringStatusDisplay(status, currentReadyAt + 2 * HOUR).stateLabel,
    ).toBe("정산 대기");
  });
});
