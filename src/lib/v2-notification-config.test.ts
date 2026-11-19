import { describe, expect, it } from "vitest";
import { explorationGradeNotificationText } from "./v2-notification-config";

describe("탐사 등급 알림 문구", () => {
  it("오른 등급을 알린다", () => {
    expect(explorationGradeNotificationText({ grade: 1_200, pointsGained: 0 })).toBe(
      "미개척지 탐사 1,200등급에 올랐습니다.",
    );
  });

  it("탐사 포인트를 함께 받았으면 개수도 알린다", () => {
    expect(explorationGradeNotificationText({ grade: 5, pointsGained: 1 })).toBe(
      "미개척지 탐사 5등급에 올랐습니다. 탐사 포인트 1개를 받았습니다.",
    );
  });
});
