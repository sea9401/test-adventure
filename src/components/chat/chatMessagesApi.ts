import { CHAT_FETCH_LIMIT } from "@/lib/chat-config";
import type { ChatChannel, ChatMessage } from "../ChatPanel";

export function chatMessagesUrl(input: {
  channel: ChatChannel;
  roomId?: number;
  afterId?: number;
}): string {
  const params = new URLSearchParams({ channel: input.channel });
  if (input.channel === "room" && input.roomId != null) {
    params.set("roomId", String(input.roomId));
  }
  if (input.afterId != null && input.afterId >= 0) {
    params.set("afterId", String(input.afterId));
  }
  return `/api/chat?${params.toString()}`;
}

export async function fetchChatMessages(input: {
  channel: ChatChannel;
  roomId?: number;
  afterId?: number;
}): Promise<ChatMessage[]> {
  const res = await fetch(chatMessagesUrl(input), { cache: "no-store" });
  if (!res.ok) throw new Error((await res.text()) || `fetch failed: ${res.status}`);
  return res.json() as Promise<ChatMessage[]>;
}

export function latestChatMessageId(messages: readonly ChatMessage[]): number {
  return messages.reduce((latest, message) => Math.max(latest, message.id), 0);
}

export function mergeChatMessages(
  previous: ChatMessage[],
  incoming: readonly ChatMessage[],
): ChatMessage[] {
  if (incoming.length === 0) return previous;
  const byId = new Map(previous.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()]
    .sort((left, right) => left.id - right.id)
    .slice(-CHAT_FETCH_LIMIT);
}
