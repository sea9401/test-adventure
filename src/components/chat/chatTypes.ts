import type { MuseunCosmeticAppearance } from "@/adventure/data/v2/museunCosmetics";
import type { Avatar } from "@/adventure/profile/avatars";
import type { ChatEquipmentLink } from "@/lib/chat-item-link";

// 채팅 메시지 형식 — 채팅 창(ChatPanel)과 메시지 목록·API 도우미가 함께 쓴다.
export type ChatChannel = "global" | "trade" | "guild" | "room";

export type ChatMessage = {
  id: number;
  authorUserId?: string | null;
  channel: ChatChannel;
  roomId?: number | null;
  name: string;
  className: string;
  title: string | null;
  content: string;
  itemLink?: ChatEquipmentLink | null;
  createdAt: number;
  mine: boolean;
  /** 작성자 프사. 예전 응답이나 시스템 알림에는 없을 수 있다. */
  avatar?: Avatar | null;
  cosmetics?: MuseunCosmeticAppearance | null;
};
