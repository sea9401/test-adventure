import { describe, expect, it } from "vitest";
import { pushMessageForNotification } from "./webPush";

describe("시스템 푸시 이벤트 매핑", () => {
  it("현재 운영하는 길드·협동·문의 알림을 매핑한다", () => {
    expect(
      pushMessageForNotification("guild_join_accepted", {
        guildId: 1,
        guildName: "테스트 길드",
      }),
    ).toMatchObject({ title: "길드 가입 승인", url: "/guild" });
    expect(
      pushMessageForNotification("coop_defeated", {
        sessionId: "session-1",
        kindId: "boss-1",
        bossName: "거대 슬라임",
      }),
    ).toMatchObject({ title: "협동 보스 처치", url: "/battle/coop" });
    expect(
      pushMessageForNotification("feedback_replied", { feedbackId: 7 }),
    ).toMatchObject({
      title: "문의 답변 도착",
      url: "/feedback#feedback-7",
    });
  });

  it("폐기된 거점 피격·함락은 시스템 푸시에서 제외한다", () => {
    expect(
      pushMessageForNotification("outpost_attacked", {
        outpostId: "old-outpost",
        fortHp: 1,
        fortMaxHp: 10,
      }),
    ).toBeNull();
    expect(
      pushMessageForNotification("outpost_lost", {
        outpostId: "old-outpost",
      }),
    ).toBeNull();
  });
});
