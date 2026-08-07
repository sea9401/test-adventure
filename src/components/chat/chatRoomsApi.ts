import type {
  ChatRoomOrderId,
  ChatRoomVisibility,
} from "@/lib/chat-rooms";
import type { ChatMessage } from "../ChatPanel";
import { fetchChatMessages } from "./chatMessagesApi";

export type CustomChatRoom = {
  id: number;
  name: string;
  visibility: ChatRoomVisibility;
  ownerId: string;
  ownerName: string;
  role: "owner" | "member";
  memberCount: number;
  createdAt: number;
  updatedAt: number;
  latestMessage: ChatMessage | null;
};

export type PublicChatRoom = Omit<CustomChatRoom, "role">;

export type CustomChatRoomInvite = {
  id: number;
  roomId: number;
  roomName: string;
  inviterName: string;
  expiresAt: number;
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  if (!res.ok) {
    const message = await res.text();
    throw new Error(message || `request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function translateChatRoomError(message: string) {
  const errors: Record<string, string> = {
    "invalid room name": "채팅방 이름은 2~24자로 입력해주세요.",
    "invalid visibility": "공개 설정이 올바르지 않습니다.",
    "owned room limit": "직접 만들 수 있는 채팅방은 최대 5개입니다.",
    "joined room limit": "참여할 수 있는 채팅방은 최대 20개입니다.",
    "room not found": "채팅방을 찾을 수 없습니다.",
    "invite required": "비공개 채팅방은 초대를 받아야 입장할 수 있습니다.",
    "room full": "채팅방 정원이 가득 찼습니다.",
    "owner only": "방장만 초대할 수 있습니다.",
    "player not found": "해당 캐릭터를 찾을 수 없습니다.",
    "cannot invite self": "자기 자신은 초대할 수 없습니다.",
    "already member": "이미 참여 중인 사용자입니다.",
    "already invited": "이미 초대장을 보낸 사용자입니다.",
    "user blocked": "차단 관계인 사용자는 초대할 수 없습니다.",
    "ugc consent required": "커뮤니티 운영정책에 동의한 뒤 이용할 수 있습니다.",
    "invite not found": "초대장을 찾을 수 없습니다.",
    "invite not pending": "이미 처리된 초대장입니다.",
    "invite expired": "초대장이 만료되었습니다.",
    "not in room": "채팅방 참여 권한이 없습니다.",
  };
  return errors[message] ?? "채팅방 요청을 처리하지 못했습니다.";
}

export function fetchJoinedChatRooms() {
  return requestJson<{
    rooms: CustomChatRoom[];
    invites: CustomChatRoomInvite[];
    roomOrder: ChatRoomOrderId[];
  }>("/api/chat/rooms");
}

export function updateChatRoomOrder(roomOrder: ChatRoomOrderId[]) {
  return requestJson<{ ok: true; roomOrder: ChatRoomOrderId[] }>(
    "/api/chat/rooms",
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomOrder }),
    },
  );
}

export function fetchPublicChatRooms() {
  return requestJson<{ rooms: PublicChatRoom[] }>(
    "/api/chat/rooms?scope=public",
  );
}

export function createChatRoom(payload: {
  name: string;
  visibility: ChatRoomVisibility;
}) {
  return requestJson<{ room: CustomChatRoom }>("/api/chat/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function updateChatRoomMembership(
  roomId: number,
  action: "join" | "leave",
) {
  return requestJson<{ ok: true }>(`/api/chat/rooms/${roomId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
}

export function inviteToChatRoom(roomId: number, targetName: string) {
  return requestJson<{ ok: true; targetName: string }>(
    `/api/chat/rooms/${roomId}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "invite", targetName }),
    },
  );
}

export function respondToChatRoomInvite(
  inviteId: number,
  action: "accept" | "decline",
) {
  return requestJson<{ ok: true; roomId?: number }>(
    `/api/chat/rooms/invites/${inviteId}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    },
  );
}

export function fetchCustomRoomMessages(roomId: number, afterId?: number) {
  return fetchChatMessages({ channel: "room", roomId, afterId });
}
