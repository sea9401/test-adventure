import type { InboxItem } from "@/adventure/marketplace/api";

export function bulkClaimIds(items: readonly InboxItem[]): number[] {
  return items
    .filter(
      (item) => item.claimState === "claimable" && item.claimedAt == null,
    )
    .map((item) => item.id);
}

export function isUnreadInboxItem(item: InboxItem): boolean {
  return item.direction !== "sent" && item.readAt == null;
}

export function unreadInboxItems(
  items: readonly InboxItem[],
): InboxItem[] {
  return items.filter(isUnreadInboxItem);
}
