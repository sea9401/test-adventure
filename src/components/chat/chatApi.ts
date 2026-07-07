import type { ChatChannel, ChatMessage } from "../ChatPanel";

export type PresenceUser = {
  name: string;
  className: string;
  title: string | null;
  mine: boolean;
};

// 서버 (api/chat/route.ts) 가 반환하는 에러 문자열 → 사용자용 한글 메시지.
export function translateChatError(msg: string): string {
  if (msg === "rate limited") return "너무 빨라요 (2초 후 다시 시도)";
  if (msg.startsWith("too long")) return "메시지가 너무 깁니다.";
  if (msg === "empty content") return "내용을 입력해주세요.";
  if (msg === "not in guild") return "길드 가입 후 사용할 수 있습니다.";
  if (msg === "unauthorized") return "로그인이 만료됐습니다. 새로고침 해주세요.";
  if (msg === "invalid json" || msg.startsWith("missing ")) return "요청 형식이 잘못됐습니다.";
  return "전송 실패";
}

export async function fetchPresence(): Promise<PresenceUser[]> {
  const res = await fetch("/api/presence", { cache: "no-store" });
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  return res.json();
}

export async function postMessage(payload: {
  name: string;
  className: string;
  title: string | null;
  channel: ChatChannel;
  content: string;
}): Promise<ChatMessage> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `post failed: ${res.status}`);
  }
  return res.json();
}
