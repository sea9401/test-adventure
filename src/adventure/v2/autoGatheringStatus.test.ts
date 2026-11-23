import { describe, expect, it } from "vitest";
import {
  autoGatheringStatusText,
  correctedAutoGatheringReadyAt,
  parseAutoGatheringSessionView,
  parseAutoGatheringStatusPayload,
} from "./autoGathering";

describe("자동 생활 작업 상태와 시각 보정", () => {
  it("서버와 기기 시계가 달라도 서버에 남은 작업 시간을 유지한다", () => {
    expect(correctedAutoGatheringReadyAt(1_120_000, 1_000_000, 9_000_000)).toBe(
      9_120_000,
    );
    expect(correctedAutoGatheringReadyAt(9_120_000, 9_000_000, 1_000_000)).toBe(
      1_120_000,
    );
  });

  it("서버 기준 자동 작업 세션을 기기 시각 기준으로 파싱한다", () => {
    expect(
      parseAutoGatheringSessionView(
        {
          sessionId: "auto-1",
          planId: "standard",
          sourceId: "pine",
          sourceName: "소나무",
          materialId: "v2_pine_log",
          startedAt: 980_000,
          readyAt: 1_120_000,
          attempts: 20,
        },
        { serverNow: 1_000_000, clientNow: 9_000_000 },
      ),
    ).toEqual({
      sessionId: "auto-1",
      planId: "standard",
      sourceId: "pine",
      sourceName: "소나무",
      materialId: "v2_pine_log",
      startedAt: 8_980_000,
      readyAt: 9_120_000,
      // 작업 시간이 실려 오지 않으면 계획의 기본 시간이다.
      durationMs: 30 * 60_000,
      attempts: 20,
    });
  });

  it("shows rest when no automatic gathering is active", () => {
    expect(autoGatheringStatusText(null, 1_000)).toBe("휴식 중");
  });

  it("shows the activity, place, and countdown while gathering", () => {
    expect(
      autoGatheringStatusText(
        {
          activity: "woodcutting",
          sourceId: "pine",
          sourceName: "초보자의 숲",
          readyAt: 91_000,
        },
        1_000,
      ),
    ).toBe("벌목 자동 중 · 초보자의 숲 · 1:30");
  });

  it("한 시간 이상 남은 장시간 작업은 시:분:초로 표시한다", () => {
    expect(
      autoGatheringStatusText(
        {
          activity: "mining",
          sourceId: "iron",
          sourceName: "철 광맥",
          readyAt: 7_200_000,
        },
        0,
      ),
    ).toBe("채광 자동 중 · 철 광맥 · 2:00:00");
  });

  it("shows settlement pending after mining finishes", () => {
    expect(
      autoGatheringStatusText(
        {
          activity: "mining",
          sourceId: "iron",
          sourceName: "바위산 채석장",
          readyAt: 50_000,
        },
        50_000,
      ),
    ).toBe("채광 정산 대기 · 바위산 채석장");
  });

  it("상태 응답의 자동 작업과 예약한 다음 작업을 기기 시각 기준으로 읽는다", () => {
    expect(
      parseAutoGatheringStatusPayload(
        {
          activity: "mining",
          sourceId: "copper",
          sourceName: "구리 광맥",
          readyAt: 1_120_000,
          next: { activity: "woodcutting", sourceName: "소나무", readyAt: 1_720_000 },
          serverNow: 1_000_000,
        },
        9_000_000,
      ),
    ).toEqual({
      activity: "mining",
      sourceId: "copper",
      sourceName: "구리 광맥",
      readyAt: 9_120_000,
      next: { activity: "woodcutting", sourceName: "소나무", readyAt: 9_720_000 },
    });
    expect(parseAutoGatheringStatusPayload(null)).toBeNull();
    expect(
      parseAutoGatheringStatusPayload({ activity: "fishing", serverNow: 1 }),
    ).toBeNull();
  });
});
