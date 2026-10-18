import { describe, expect, it } from "vitest";
import {
  guildDisbandedNotificationText,
  guildKickedNotificationText,
  masterProductNotificationText,
  V2_NOTIFICATION_TYPES,
  unreadV2Notifications,
  type V2NotificationEntry,
} from "./v2-notification-config";

function notification(
  id: number,
  readAt: number | null,
): V2NotificationEntry {
  return {
    id,
    type: "title_unlocked",
    payload: { titleId: `title-${id}`, titleName: `칭호 ${id}` },
    readAt,
    createdAt: id * 1_000,
  };
}

describe("unreadV2Notifications", () => {
  it("도감 연구 트로피 알림 타입을 영속 목록에 포함한다", () => {
    expect(V2_NOTIFICATION_TYPES).toContain("codex_research_trophy");
  });
  it("읽은 알림은 다음 목록 조회에서 제외한다", () => {
    expect(
      unreadV2Notifications([
        notification(1, null),
        notification(2, 2_000),
        notification(3, null),
      ]).map((entry) => entry.id),
    ).toEqual([1, 3]);
  });
});

describe("명장 산물 알림 문구", () => {
  it("산물 이름과 수량을 알린다", () => {
    expect(
      masterProductNotificationText({
        activity: "mining",
        materialId: "v2_master_alloy",
        name: "명장 합금",
        count: 3,
      }),
    ).toBe("명장 산물 명장 합금 3개를 얻었습니다.");
  });
});

describe("길드 추방·해산 알림 문구", () => {
  it("추방 알림은 길드 이름과 가입 제한 해제 시각을 알린다", () => {
    expect(
      guildKickedNotificationText({
        guildId: 3,
        guildName: "은빛",
        cooldownUntil: Date.UTC(2026, 9, 16, 10, 33),
      }),
    ).toBe(
      "은빛 길드에서 추방되었습니다. 2026.10.16 19:33까지 다른 길드에 가입할 수 없습니다.",
    );
  });

  it("해산 알림은 바로 다른 길드에 가입할 수 있다고 알린다", () => {
    expect(
      guildDisbandedNotificationText({ guildId: 3, guildName: "은빛" }),
    ).toBe("은빛 길드가 해산되었습니다. 바로 다른 길드에 가입할 수 있습니다.");
  });
});
