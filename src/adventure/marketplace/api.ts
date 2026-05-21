import type { RemoteSave } from "@/lib/storage/remote";
import type { EquipVariantKey } from "@/adventure/inventory/vaultOps";
import type { EquipmentInstance } from "@/adventure/inventory/equipmentInstances";
import type { ItemKind, ListResponse, Listing, SortMode } from "./types";

// 서버 wire schema (historically `grade` 필드). 클라 내부는 모두 `variantKey` — 본 파일이
// boundary 매퍼 역할 (LOW #23).
type WireListing = Omit<Listing, "variantKey"> & { grade: string };
type WireListResponse = { items: WireListing[]; nextCursor: string | null };

function listingFromWire(wire: WireListing): Listing {
  const { grade, ...rest } = wire;
  return { ...rest, variantKey: (grade as EquipVariantKey) ?? "base" };
}

export type ListQuery = {
  q?: string;
  kind?: ItemKind | "all";
  // vault variant 키와 동일: 'base'|'c-2'|'c-1'|'c1'|'c2'|'d1'|'d2'. 'all' / undefined = 전체.
  variantKey?: EquipVariantKey | "all";
  sort?: SortMode;
  mine?: boolean;
  cursor?: string | null;
  limit?: number;
};

export async function fetchListings(
  q: ListQuery,
  signal?: AbortSignal,
): Promise<ListResponse> {
  const url = new URL("/api/marketplace/listings", window.location.origin);
  if (q.q) url.searchParams.set("q", q.q);
  if (q.kind && q.kind !== "all") url.searchParams.set("kind", q.kind);
  // 서버는 URL param 이름이 historically `grade` — 호환 위해 유지.
  if (q.variantKey && q.variantKey !== "all")
    url.searchParams.set("grade", q.variantKey);
  if (q.sort) url.searchParams.set("sort", q.sort);
  if (q.mine) url.searchParams.set("mine", "1");
  if (q.cursor) url.searchParams.set("cursor", q.cursor);
  if (q.limit) url.searchParams.set("limit", String(q.limit));
  const r = await fetch(url.toString(), { signal });
  if (!r.ok) throw new Error(`목록 로드 실패 (${r.status})`);
  const wire = (await r.json()) as WireListResponse;
  return {
    items: wire.items.map(listingFromWire),
    nextCursor: wire.nextCursor,
  };
}

export type CreateParams = {
  itemKind: ItemKind;
  itemId: string;
  // 장비 변형 키. 미지정 = 'base'. equip 외 kind 는 항상 'base'.
  variantKey?: EquipVariantKey;
  quantity: number;
  price: number;
  // 인스턴스 매물 — 지정 시 서버가 셀러 인벤의 해당 인스턴스를 거래(itemId/grade/quantity 서버 파생).
  instanceId?: string;
};

export type CreateResult = {
  ok: true;
  listing: Omit<Listing, "sellerId" | "sellerName" | "isMine">;
  inventory: unknown; // 서버가 적용한 inventory.v2 스냅샷
};

type WireCreateResult = {
  ok: true;
  listing: Omit<WireListing, "sellerId" | "sellerName" | "isMine">;
  inventory: unknown;
};

// 등록 — 호출 전에 RemoteSave.flush() 로 로컬 보류 PATCH 를 모두 보내서
// 서버측 inventory.v2 가 최신 상태에서 차감되도록 한다.
export async function createListing(
  remote: RemoteSave,
  params: CreateParams,
): Promise<CreateResult> {
  await remote.flush();
  // 서버는 body 의 `grade` 필드를 기대 — 클라 internal `variantKey` 를 wire 명칭으로 변환.
  const wireBody: Record<string, unknown> = {
    itemKind: params.itemKind,
    itemId: params.itemId,
    quantity: params.quantity,
    price: params.price,
    grade: params.variantKey ?? "base",
    ...(params.instanceId ? { instanceId: params.instanceId } : {}),
  };
  const r = await fetch("/api/marketplace/listings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(wireBody),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(translateError(text, r.status));
  }
  const wire = (await r.json()) as WireCreateResult;
  const { grade, ...listingRest } = wire.listing;
  return {
    ok: true,
    listing: {
      ...listingRest,
      variantKey: (grade as EquipVariantKey) ?? "base",
    },
    inventory: wire.inventory,
  };
}

export type CancelResult = { ok: true; inventory: unknown };

export async function cancelListing(
  remote: RemoteSave,
  id: number,
): Promise<CancelResult> {
  await remote.flush();
  const r = await fetch(
    `/api/marketplace/listings?id=${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
  if (!r.ok) {
    const text = await r.text();
    throw new Error(translateError(text, r.status));
  }
  return (await r.json()) as CancelResult;
}

export type BuyResult = {
  ok: true;
  newGold: number;
  fee: number;
  sellerName: string;
  itemName: string;
  quantity: number;
  inboxId: number;
};

export async function buyListing(
  remote: RemoteSave,
  listingId: number,
): Promise<BuyResult> {
  await remote.flush();
  const r = await fetch("/api/marketplace/listings/buy", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: listingId }),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(translateError(text, r.status));
  }
  return (await r.json()) as BuyResult;
}

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
    | "guild_quest_reward";
  payload: Record<string, unknown>;
  message: string | null;
  listingId: number | null;
  fromName: string | null;
  createdAt: string;
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

export type ClaimResult = {
  ok: true;
  claimed: number[];
  goldAdded: number;
  itemsAdded: {
    kind: "equip" | "material" | "skill_book";
    id: string;
    // 장비 변형 키 — equip 만 의미. 'base' 면 일반 equipment[] 로 합산.
    variantKey: EquipVariantKey;
    quantity: number;
  }[];
  // 인스턴스 매물 수령분(강화/부여 별빛 무구·고리) — 새 instanceId 발급된 상태.
  instancesAdded?: EquipmentInstance[];
  recipesAdded: string[];
  recipesSkipped: string[];
  newGold: number | null;
  newInventory: unknown | null;
};

type WireClaimResult = Omit<ClaimResult, "itemsAdded"> & {
  itemsAdded: {
    kind: "equip" | "material" | "skill_book";
    id: string;
    grade: string;
    quantity: number;
  }[];
};

export async function claimInbox(
  remote: RemoteSave,
  ids: number[],
): Promise<ClaimResult> {
  await remote.flush();
  const r = await fetch("/api/marketplace/inbox/claim", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(translateError(text, r.status));
  }
  const wire = (await r.json()) as WireClaimResult;
  return {
    ...wire,
    itemsAdded: wire.itemsAdded.map((x) => {
      const { grade, ...rest } = x;
      return { ...rest, variantKey: (grade as EquipVariantKey) ?? "base" };
    }),
  };
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
    case "slot_limit":
      return "동시 등록 슬롯 한도(10개)를 넘었습니다.";
    case "insufficient":
      return "인벤토리에 해당 수량이 없습니다.";
    case "insufficient_gold":
      return "골드가 부족합니다.";
    case "self_buy":
      return "본인이 등록한 매물은 구매할 수 없습니다.";
    case "no_character":
      return "캐릭터 데이터가 없습니다.";
    case "no_unclaimed":
      return "수령할 우편이 없습니다.";
    case "not_tradable":
    case "not tradable":
      return "이 아이템은 거래할 수 없습니다.";
    case "not_known":
      return "본인이 알지 못하는 제작서는 등록할 수 없습니다.";
    case "already_known":
      return "이미 알고 있는 제작서입니다.";
    case "already_shared":
      return "이 제작서는 이미 공유에 사용했습니다. 다시 습득하면 충전됩니다.";
    case "recipe_not_found":
      return "해당 제작서를 찾을 수 없습니다.";
    case "recipe_not_tradable":
      return "이 제작서는 공유할 수 없습니다.";
    case "recipe_not_known":
      return "본인이 알지 못하는 제작서는 보낼 수 없습니다.";
    case "not_active":
      return "이미 판매되었거나 취소된 listing 입니다.";
    case "not_found":
      return "listing 을 찾을 수 없습니다.";
    case "forbidden":
      return "권한이 없습니다.";
    case "race":
      return "다른 작업과 충돌했습니다. 다시 시도하세요.";
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
