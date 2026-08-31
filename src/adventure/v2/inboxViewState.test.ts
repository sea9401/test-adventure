import { describe, expect, it } from "vitest";
import type { InboxItem } from "@/adventure/marketplace/api";
import {
  bulkClaimIds,
  isUnreadInboxItem,
  unreadInboxItems,
} from "./inboxViewState";

function item(
  id: number,
  claimState: InboxItem["claimState"],
  overrides: Partial<InboxItem> = {},
): InboxItem {
  return {
    id,
    kind: "user_message",
    payload: { text: "우편" },
    message: null,
    listingId: null,
    fromName: "모험가",
    recipientName: null,
    direction: "received",
    createdAt: "2026-08-12T00:00:00.000Z",
    readAt: null,
    claimedAt: null,
    hasReward: claimState === "claimable",
    claimState,
    ...overrides,
  };
}

describe("bulkClaimIds", () => {
  it("미수령 보상만 선택하고 보상 없는 우편·초대·손상 우편은 남긴다", () => {
    expect(
      bulkClaimIds([
        item(1, "none"),
        item(2, "claimable", { kind: "admin_gift" }),
        item(3, "action", { kind: "guild_invite" }),
        item(4, "invalid", { kind: "season_reward" }),
        item(5, "claimable", {
          kind: "admin_gift",
          claimedAt: "2026-08-12T01:00:00.000Z",
        }),
      ]),
    ).toEqual([2]);
  });
});

describe("isUnreadInboxItem", () => {
  it("수령 여부와 무관하게 readAt이 없는 받은 우편만 미확인이다", () => {
    expect(isUnreadInboxItem(item(1, "none"))).toBe(true);
    expect(
      isUnreadInboxItem(
        item(2, "claimable", { readAt: "2026-08-12T01:00:00.000Z" }),
      ),
    ).toBe(false);
    expect(
      isUnreadInboxItem(
        item(3, "none", {
          direction: "sent",
          readAt: null,
          claimedAt: null,
        }),
      ),
    ).toBe(false);
  });

  it("알림 요약에는 미확인 받은 우편만 남긴다", () => {
    expect(
      unreadInboxItems([
        item(1, "none"),
        item(2, "none", { readAt: "2026-08-12T01:00:00.000Z" }),
        item(3, "none", { direction: "sent" }),
      ]).map((entry) => entry.id),
    ).toEqual([1]);
  });
});
