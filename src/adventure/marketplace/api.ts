// 우편함 클라이언트 API. v2 가 쓰는 우편함 조회 + 쪽지 보내기만 유지
// (거래소 listings/buy/create/cancel 흐름은 v2 미사용으로 제거됨).

export type InboxItem = {
  id: number;
  kind:
    | "sale_proceeds"
    | "purchase_item"
    | "cancel_return"
    | "user_message"
    | "recipe_gift"
    | "listing_expired"
    | "guild_invite"
    | "guild_quest_reward"
    | "season_reward"
    | "admin_gift";
  payload: Record<string, unknown>;
  message: string | null;
  listingId: number | null;
  fromName: string | null;
  recipientName: string | null;
  direction?: "received" | "sent";
  createdAt: string;
  // 읽은(수령한) 시각. 미수령 우편은 null, 기록(history) 우편은 ISO 문자열.
  claimedAt?: string | null;
};

export type InboxResponse = {
  items: InboxItem[];
  unclaimedCount: number;
};

export async function fetchInbox(): Promise<InboxResponse> {
  const r = await fetch("/api/marketplace/inbox");
  if (!r.ok) throw new Error(`우편함 로드 실패 (${r.status})`);
  return (await r.json()) as InboxResponse;
}

// 받은 우편 기록 — 이미 읽은(수령한) 우편 최근분. 클릭 시 내용 다시 확인용.
export async function fetchInboxHistory(): Promise<InboxResponse> {
  const r = await fetch("/api/marketplace/inbox?history=1");
  if (!r.ok) throw new Error(`우편 기록 로드 실패 (${r.status})`);
  return (await r.json()) as InboxResponse;
}

// 보낸 우편 기록 — 내가 발송한 쪽지/선물 최근분. claimedAt 으로 상대 확인 여부를 표시한다.
export async function fetchInboxSent(): Promise<InboxResponse> {
  const r = await fetch("/api/marketplace/inbox?sent=1");
  if (!r.ok) throw new Error(`보낸 우편 기록 로드 실패 (${r.status})`);
  return (await r.json()) as InboxResponse;
}

export type SendMessageResult = { ok: true; recipientName: string };

export async function sendUserMessage(
  recipientName: string,
  text: string,
  attachedRecipeId?: string | null,
): Promise<SendMessageResult> {
  const r = await fetch("/api/inbox/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ recipientName, text, attachedRecipeId }),
  });
  if (!r.ok) {
    const body = await r.text();
    let code = body;
    let suffix = "";
    try {
      const parsed = JSON.parse(body) as { error?: string; probe?: unknown };
      if (typeof parsed.error === "string") code = parsed.error;
      if (parsed.probe) suffix = ` [디버그: ${JSON.stringify(parsed.probe)}]`;
    } catch {
      // body 가 plain text 인 기존 응답 — 그대로 code 로 사용.
    }
    throw new Error(translateError(code, r.status) + suffix);
  }
  return (await r.json()) as SendMessageResult;
}

function translateError(text: string, status: number): string {
  switch (text) {
    case "insufficient":
      return "인벤토리에 해당 수량이 없습니다.";
    case "no_character":
      return "캐릭터 데이터가 없습니다.";
    case "not_known":
      return "본인이 알지 못하는 제작서는 보낼 수 없습니다.";
    case "recipe_not_found":
      return "해당 제작서를 찾을 수 없습니다.";
    case "recipe_not_tradable":
      return "이 제작서는 공유할 수 없습니다.";
    case "recipe_not_known":
      return "본인이 알지 못하는 제작서는 보낼 수 없습니다.";
    case "recipient_not_found":
      return "해당 닉네임의 유저를 찾을 수 없습니다.";
    case "self_send":
      return "자기 자신에게는 보낼 수 없습니다.";
    case "sender_no_name":
      return "닉네임을 먼저 설정해야 합니다.";
    case "empty text":
      return "내용을 입력하세요.";
    case "missing recipient":
      return "받는 사람을 입력하세요.";
    case "rate limited":
      return "조금 천천히 보내주세요.";
    case "daily_cap":
      return "오늘 발송 한도를 초과했습니다.";
    default:
      if (text.startsWith("too long")) return "내용이 너무 깁니다.";
      return `요청 실패 (${status}): ${text}`;
  }
}
