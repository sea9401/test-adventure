export const CHAT_ROOM_NAME_MIN = 2;
export const CHAT_ROOM_NAME_MAX = 24;
export const CHAT_ROOM_OWNED_MAX = 5;
export const CHAT_ROOM_JOINED_MAX = 20;
export const CHAT_ROOM_MEMBER_MAX = 100;
export const CHAT_ROOM_INVITE_DAYS = 7;

export type ChatRoomVisibility = "public" | "private";

export function isChatRoomVisibility(
  value: unknown,
): value is ChatRoomVisibility {
  return value === "public" || value === "private";
}

export function normalizeChatRoomName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.replace(/\s+/g, " ").trim();
  if (name.length < CHAT_ROOM_NAME_MIN || name.length > CHAT_ROOM_NAME_MAX) {
    return null;
  }
  if (/\p{Cc}/u.test(name)) return null;
  return name;
}
