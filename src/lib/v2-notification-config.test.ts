import { describe, expect, it } from "vitest";
import {
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
