import {
  isTradeSuspensionMessagePayload,
  tradeSuspensionMessage,
} from "@/lib/tradeSuspension";

// 길드 쪽지(/api/v2/guild/message) 클라이언트 — 남은 횟수 조회와 발송.

export type GuildMessageQuota = {
  remaining: number;
  limit: number;
  recipientCount: number;
};

export type GuildMessageSendResult =
  | { ok: true; sentCount: number; remaining: number; limit: number }
  | { ok: false; message: string; remaining?: number };

const ERROR_TEXT: Record<string, string> = {
  empty_text: "내용을 입력해 주세요.",
  text_too_long: "내용이 너무 길어요.",
  daily_limit: "오늘 보낼 수 있는 길드 쪽지를 모두 보냈어요.",
  no_recipients: "받을 수 있는 길드원이 없어요.",
  not_manager: "마스터와 관리자만 길드 쪽지를 보낼 수 있어요.",
  no_guild: "길드에 가입되어 있지 않아요.",
  guild_not_found: "길드를 찾을 수 없어요.",
  sender_no_name: "닉네임을 먼저 정해야 해요.",
  "ugc consent required": "커뮤니티 운영정책에 동의한 뒤 보낼 수 있어요.",
};

export function guildMessageErrorText(payload: unknown, status: number): string {
  if (isTradeSuspensionMessagePayload(payload)) return tradeSuspensionMessage(payload);
  const code =
    payload && typeof payload === "object"
      ? (payload as { error?: unknown }).error
      : payload;
  if (typeof code === "string" && ERROR_TEXT[code]) return ERROR_TEXT[code];
  if (status === 429) return "잠시 후 다시 보내 주세요.";
  return "보내지 못했어요. 잠시 후 다시 시도해 주세요.";
}

export async function fetchGuildMessageQuota(): Promise<GuildMessageQuota | null> {
  const res = await fetch("/api/v2/guild/message", { cache: "no-store" });
  if (!res.ok) return null;
  const json = (await res.json().catch(() => null)) as
    | (GuildMessageQuota & { ok?: boolean })
    | null;
  if (!json?.ok) return null;
  return {
    remaining: json.remaining,
    limit: json.limit,
    recipientCount: json.recipientCount,
  };
}

export async function sendGuildMessage(text: string): Promise<GuildMessageSendResult> {
  const res = await fetch("/api/v2/guild/message", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const raw = await res.text();
  let payload: unknown = raw;
  try {
    payload = JSON.parse(raw);
  } catch {
    // 동의 누락처럼 평문으로 오는 오류는 그대로 코드로 쓴다.
  }
  if (res.ok && payload && typeof payload === "object") {
    const p = payload as { sentCount: number; remaining: number; limit: number };
    return { ok: true, sentCount: p.sentCount, remaining: p.remaining, limit: p.limit };
  }
  const remaining =
    payload && typeof payload === "object"
      ? (payload as { remaining?: unknown }).remaining
      : undefined;
  return {
    ok: false,
    message: guildMessageErrorText(payload, res.status),
    ...(typeof remaining === "number" ? { remaining } : {}),
  };
}
