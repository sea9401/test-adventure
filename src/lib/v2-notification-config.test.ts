import { describe, expect, it } from "vitest";
import {
  auctionUnsoldNotificationText, explorationGradeNotificationText } from "./v2-notification-config";

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

describe("유찰 알림 문구", () => {
  it("돌아온 경우와 자동으로 다시 올라간 경우를 구분한다", () => {
    expect(
      auctionUnsoldNotificationText({ listingId: 1, itemName: "철광석", quantity: 40 }),
    ).toBe("거래소에 올린 철광석 ×40이(가) 유찰되어 돌아왔습니다.");
    expect(
      auctionUnsoldNotificationText({
        listingId: 1,
        itemName: "철광석",
        quantity: 40,
        relistedPrice: 7_000,
      }),
    ).toBe("거래소에 올린 철광석 ×40이(가) 유찰되어 7,000골드로 다시 올렸습니다.");
  });
});
