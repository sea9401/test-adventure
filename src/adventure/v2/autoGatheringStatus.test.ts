import { describe, expect, it } from "vitest";
import { autoGatheringStatusText } from "./autoGathering";

describe("autoGatheringStatusText", () => {
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
});
