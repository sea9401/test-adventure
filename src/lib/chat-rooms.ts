export const CHAT_ROOM_NAME_MIN = 2;
export const CHAT_ROOM_NAME_MAX = 24;
export const CHAT_ROOM_OWNED_MAX = 5;
export const CHAT_ROOM_JOINED_MAX = 20;
export const CHAT_ROOM_MEMBER_MAX = 100;
export const CHAT_ROOM_INVITE_DAYS = 7;
export const CHAT_ROOM_ORDER_SAVE_KEY = "chat-room-order.v1";
export const CHAT_ROOM_ORDER_MAX = 64;

export const DEFAULT_BUILTIN_CHAT_ROOM_ORDER = [
  "chat",
  "trade",
  "notice",
  "guild",
] as const;

export type BuiltinChatRoomId =
  (typeof DEFAULT_BUILTIN_CHAT_ROOM_ORDER)[number];
export type ChatRoomOrderId = BuiltinChatRoomId | `room:${number}`;

export type ChatRoomVisibility = "public" | "private";

export function isChatRoomOrderId(value: unknown): value is ChatRoomOrderId {
  if (
    typeof value !== "string" ||
    value.length > 32
  ) {
    return false;
  }
  if ((DEFAULT_BUILTIN_CHAT_ROOM_ORDER as readonly string[]).includes(value)) {
    return true;
  }
  if (!value.startsWith("room:")) return false;
  const roomId = Number(value.slice(5));
  return Number.isSafeInteger(roomId) && roomId > 0;
}

export function parseChatRoomOrder(value: unknown): ChatRoomOrderId[] {
  const raw =
    value && typeof value === "object" && "roomOrder" in value
      ? (value as { roomOrder?: unknown }).roomOrder
      : value;
  if (!Array.isArray(raw)) return [];
  const result: ChatRoomOrderId[] = [];
  const seen = new Set<string>();
  for (const id of raw.slice(0, CHAT_ROOM_ORDER_MAX)) {
    if (!isChatRoomOrderId(id) || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

export function isValidChatRoomOrderInput(
  value: unknown,
): value is ChatRoomOrderId[] {
  return (
    Array.isArray(value) &&
    value.length <= CHAT_ROOM_ORDER_MAX &&
    value.every(isChatRoomOrderId)
  );
}

/** 저장 순서를 현재 참여방과 합치고, 새 방은 기본/참여 순서의 끝에 붙인다. */
export function reconcileChatRoomOrder(
  preferred: readonly ChatRoomOrderId[],
  joinedRoomIds: readonly number[],
): ChatRoomOrderId[] {
  const available = [
    ...DEFAULT_BUILTIN_CHAT_ROOM_ORDER,
    ...joinedRoomIds.map((roomId) => `room:${roomId}` as const),
  ];
  const availableSet = new Set<string>(available);
  const result: ChatRoomOrderId[] = [];
  const seen = new Set<string>();
  for (const id of [...preferred, ...available]) {
    if (!availableSet.has(id) || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

export function moveChatRoomOrder(
  order: readonly ChatRoomOrderId[],
  sourceId: ChatRoomOrderId,
  targetId: ChatRoomOrderId,
): ChatRoomOrderId[] {
  const sourceIndex = order.indexOf(sourceId);
  const targetIndex = order.indexOf(targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
    return [...order];
  }
  const next = [...order];
  const [source] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, source);
  return next;
}

export function visibleChatRoomOrder(
  order: readonly ChatRoomOrderId[],
  guildAvailable: boolean,
): ChatRoomOrderId[] {
  return guildAvailable ? [...order] : order.filter((id) => id !== "guild");
}

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
