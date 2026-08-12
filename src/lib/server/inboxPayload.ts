// marketplaceInbox.payload 의 typed discriminated union + 런타임 검증 + 빌더.
//
// 동기:
//   - payload 는 jsonb 라 DB·TS 단에서 shape 검증이 없음. 과거엔 write/read 사이트마다
//     `(p as { gold?: unknown }).gold` 식 ad-hoc 캐스팅이 흩어져 있어서, kind/payload 가
//     실수로 어긋나도 잡히지 않았다.
//   - 새 kind 추가 시 InboxPayload union + parseInboxPayload switch + InboxValues 모두
//     수정해야 typecheck 통과 → 컴파일이 동기화를 강제한다.
//
// 사용:
//   - write: `db.insert(marketplaceInbox).values(inboxValues({ userId, payload: { kind, ... }, ... }))`
//   - read:  `parseInboxPayload(row.kind, row.payload)` → typed union or null (잘못된 shape).
import { isItemKind, isValidGrade, type ItemKind } from "./marketplace";
import {
  normalizeInstance,
  type EquipmentInstance,
} from "@/adventure/inventory/equipmentInstances";
import {
  isMuseunAdminGiftItemId,
  type MuseunAdminGiftItemId,
} from "@/adventure/data/v2/museunCashItems";
import { TITLES } from "@/adventure/data/titles";

export type GuildQuestRewardMaterial = { materialId: string; count: number };
export type GuildQuestRewardItem = { itemId: string; count: number };
export type AdminGiftCashItem = {
  itemId: MuseunAdminGiftItemId;
  count: number;
};

// 주간 시즌 순위 보상이 적립될 지갑 종류. claim 시 이 값으로 해당 코인 지갑에 적립.
export type SeasonRewardSeason = "pvp" | "fishing";
const SEASON_REWARD_SEASONS = new Set<string>(["pvp", "fishing"]);
export function isSeasonRewardSeason(s: string): s is SeasonRewardSeason {
  return SEASON_REWARD_SEASONS.has(s);
}

// inbox kind. 새 kind 추가 시 이 union + KINDS + parseInboxPayload switch 갱신 필수.
export type InboxPayload =
  | { kind: "sale_proceeds"; gold: number }
  | { kind: "bid_refund"; gold: number }
  | { kind: "buy_order_refund"; gold: number }
  | { kind: "price_alert"; text: string }
  | {
      kind: "buy_order_item";
      item_kind: "material" | "cash" | "cooking" | "specimen";
      item_id: string;
      quantity: number;
    }
  | {
      kind: "buy_order_equipment";
      order_id?: number;
      item_id: string;
      instance_payload: Record<string, unknown> | null;
    }
  | {
      kind: "purchase_item";
      item_kind: ItemKind;
      item_id: string;
      grade: string;
      quantity: number;
      /** 인스턴스 매물(강화/부여 별빛 무구·고리) — 있으면 claim 시 새 instanceId 로 인벤에 push. */
      instance?: EquipmentInstance;
    }
  | {
      kind: "cancel_return";
      item_kind: ItemKind;
      item_id: string;
      grade: string;
      quantity: number;
      instance?: EquipmentInstance;
    }
  | {
      kind: "listing_expired";
      item_kind: ItemKind;
      item_id: string;
      grade: string;
      quantity: number;
      instance?: EquipmentInstance;
    }
  | { kind: "user_message"; text: string }
  | { kind: "recipe_gift"; recipe_id: string; recipe_name: string }
  | {
      kind: "guild_invite";
      invite_id: number;
      guild_id: number;
      guild_name: string;
      expires_at: string;
    }
  | {
      kind: "guild_quest_reward";
      quest_id: string;
      quest_name: string;
      gold: number;
      materials: GuildQuestRewardMaterial[];
      items: GuildQuestRewardItem[];
    }
  | {
      kind: "season_reward";
      /** 시즌 종류 — claim 시 보상이 적립될 코인 지갑 결정. */
      season: SeasonRewardSeason;
      coins: number;
      /** 최종 순위(1-based) — 표시용. 낚시는 종합 집계라 없을 수 있음(옵셔널). */
      rank?: number;
    }
  | {
      // 운영자 대량 우편(이벤트 보상·보정금). claim 시 골드 + 재료/장비/소비템/무슨 코인 지급.
      // 메시지는 message 컬럼. 장비는 길드 의뢰 보상과 동일하게 base 등급으로 지급.
      kind: "admin_gift";
      gold: number;
      materials: GuildQuestRewardMaterial[];
      items: GuildQuestRewardItem[];
      staminaPotions: number;
      museunCoins: number;
      cashItems: AdminGiftCashItem[];
      /** 수령 시점부터 시작되는 월간 모험 지원권 기간. 활성 중이면 남은 기간 뒤에 이어 붙임. */
      adventureSupportDays: number;
      /** 능력치 없는 영구 칭호. 누락은 기존 운영자 우편 호환을 위해 빈 배열로 취급. */
      titleIds?: string[];
    };

export type InboxPayloadKind = InboxPayload["kind"];

const KINDS = new Set<string>([
  "sale_proceeds",
  "bid_refund",
  "buy_order_refund",
  "buy_order_item",
  "buy_order_equipment",
  "price_alert",
  "purchase_item",
  "cancel_return",
  "listing_expired",
  "user_message",
  "recipe_gift",
  "guild_invite",
  "guild_quest_reward",
  "season_reward",
  "admin_gift",
]);

export function isInboxPayloadKind(k: string): k is InboxPayloadKind {
  return KINDS.has(k);
}

// DB 에서 읽은 jsonb 를 검증된 union 으로. shape 가 어긋나면 null —
// 호출 측에서 스킵하거나 "(알 수 없는 우편)" 류로 fallback.
export function parseInboxPayload(
  kind: string,
  payload: unknown,
): InboxPayload | null {
  if (!isInboxPayloadKind(kind)) return null;
  if (typeof payload !== "object" || payload === null) return null;
  const p = payload as Record<string, unknown>;

  switch (kind) {
    case "sale_proceeds":
    case "bid_refund":
    case "buy_order_refund": {
      const gold = asNonNegInt(p.gold);
      if (gold == null) return null;
      return { kind, gold };
    }
    case "buy_order_item": {
      const item_kind = asString(p.item_kind);
      const item_id = asString(p.item_id);
      const quantity = asNonNegInt(p.quantity);
      if (
        (item_kind !== "material" &&
          item_kind !== "cash" &&
          item_kind !== "cooking" &&
          item_kind !== "specimen") ||
        !item_id ||
        quantity == null ||
        quantity < 1
      ) {
        return null;
      }
      return { kind, item_kind, item_id, quantity };
    }
    case "buy_order_equipment": {
      const item_id = asString(p.item_id);
      const order_id = asNonNegInt(p.order_id);
      const instance_payload = p.instance_payload;
      if (
        !item_id ||
        (instance_payload !== null &&
          (typeof instance_payload !== "object" ||
            Array.isArray(instance_payload)))
      ) {
        return null;
      }
      return {
        kind,
        ...(order_id == null ? {} : { order_id }),
        item_id,
        instance_payload: instance_payload as Record<string, unknown> | null,
      };
    }
    case "purchase_item":
    case "cancel_return":
    case "listing_expired": {
      const item_kind_str = asString(p.item_kind);
      const item_id = asString(p.item_id);
      const quantity = asNonNegInt(p.quantity);
      if (
        !item_kind_str ||
        !isItemKind(item_kind_str) ||
        !item_id ||
        quantity == null
      ) {
        return null;
      }
      // grade 누락/빈문자/비유효 → 'base' (구 페이로드 + equip 외 kind 호환).
      const rawGrade = asString(p.grade) ?? "base";
      const grade = isValidGrade(rawGrade) ? rawGrade : "base";
      // 인스턴스 매물 — instance 가 있으면 normalizeInstance 로 검증(위조/손상 가드).
      // 손상 시 payload 전체를 null 로 → claim 이 행을 보존(소실 방지·조사 가능).
      if (p.instance !== undefined) {
        const instance = normalizeInstance(p.instance);
        if (!instance) return null;
        return { kind, item_kind: item_kind_str, item_id, grade, quantity, instance };
      }
      return { kind, item_kind: item_kind_str, item_id, grade, quantity };
    }
    case "user_message": {
      const text = asString(p.text);
      if (text == null) return null;
      return { kind, text };
    }
    case "price_alert": {
      const text = asString(p.text);
      if (text == null) return null;
      return { kind, text };
    }
    case "recipe_gift": {
      const recipe_id = asString(p.recipe_id);
      if (!recipe_id) return null;
      const recipe_name = asString(p.recipe_name) ?? recipe_id;
      return { kind, recipe_id, recipe_name };
    }
    case "guild_invite": {
      const invite_id = asNonNegInt(p.invite_id);
      const guild_id = asNonNegInt(p.guild_id);
      const guild_name = asString(p.guild_name);
      const expires_at = asString(p.expires_at);
      if (
        invite_id == null ||
        guild_id == null ||
        !guild_name ||
        !expires_at
      ) {
        return null;
      }
      return { kind, invite_id, guild_id, guild_name, expires_at };
    }
    case "guild_quest_reward": {
      const quest_id = asString(p.quest_id);
      const quest_name = asString(p.quest_name);
      if (!quest_id || !quest_name) return null;
      const gold = asNonNegInt(p.gold) ?? 0;
      const materials = parseRewardMaterials(p.materials);
      const items = parseRewardItems(p.items);
      return { kind, quest_id, quest_name, gold, materials, items };
    }
    case "season_reward": {
      const coins = asNonNegInt(p.coins);
      const season = asString(p.season);
      if (coins == null || !season || !isSeasonRewardSeason(season)) return null;
      const rank = asNonNegInt(p.rank);
      return rank != null
        ? { kind, season, coins, rank }
        : { kind, season, coins };
    }
    case "admin_gift": {
      // 모든 첨부는 선택 — 구 페이로드 호환을 위해 누락은 0/빈배열로 정규화한다.
      const gold = asNonNegInt(p.gold) ?? 0;
      const materials = parseRewardMaterials(p.materials);
      const items = parseRewardItems(p.items);
      const staminaPotions = asNonNegInt(p.staminaPotions) ?? 0;
      const museunCoins = asNonNegInt(p.museunCoins) ?? 0;
      const cashItems = parseRewardCashItems(p.cashItems);
      const adventureSupportDays = asNonNegInt(p.adventureSupportDays) ?? 0;
      const titleIds = parseRewardTitleIds(p.titleIds);
      return {
        kind,
        gold,
        materials,
        items,
        staminaPotions,
        museunCoins,
        cashItems,
        adventureSupportDays,
        ...(titleIds.length > 0 ? { titleIds } : {}),
      };
    }
  }
}

export type InboxClaimState = "none" | "claimable" | "action" | "invalid";

/** 읽음과 별개로 이 우편에 수령 또는 응답 동작이 남아 있는지 판정한다. */
export function inboxClaimState(
  kind: string,
  payload: unknown,
): InboxClaimState {
  const parsed = parseInboxPayload(kind, payload);
  if (!parsed) return "invalid";

  switch (parsed.kind) {
    case "user_message":
    case "price_alert":
      return "none";
    case "guild_invite":
      return "action";
    case "sale_proceeds":
    case "bid_refund":
    case "buy_order_refund":
      return parsed.gold > 0 ? "claimable" : "none";
    case "buy_order_item":
    case "buy_order_equipment":
    case "recipe_gift":
      return "claimable";
    case "purchase_item":
      return parsed.instance || parsed.item_kind === "recipe" || parsed.quantity > 0
        ? "claimable"
        : "none";
    case "cancel_return":
    case "listing_expired":
      return parsed.instance || parsed.quantity > 0 ? "claimable" : "none";
    case "guild_quest_reward":
      return parsed.gold > 0 || parsed.materials.length > 0 || parsed.items.length > 0
        ? "claimable"
        : "none";
    case "season_reward":
      return parsed.coins > 0 ? "claimable" : "none";
    case "admin_gift":
      return parsed.gold > 0 ||
        parsed.materials.length > 0 ||
        parsed.items.length > 0 ||
        parsed.staminaPotions > 0 ||
        parsed.museunCoins > 0 ||
        parsed.cashItems.length > 0 ||
        parsed.adventureSupportDays > 0 ||
        (parsed.titleIds?.length ?? 0) > 0
        ? "claimable"
        : "none";
  }
}

// 빌더: write 사이트에서 kind 와 payload 가 drift 하지 않도록 묶어준다.
// drizzle 의 `.values()` 가 받는 column 매핑으로 정규화 — kind 컬럼과 payload
// 컬럼이 자동 분리된다.
type InboxInsertValues = {
  userId: string;
  kind: InboxPayloadKind;
  payload: Record<string, unknown>;
  message?: string | null;
  listingId?: number | null;
  fromUserId?: string | null;
  fromName?: string | null;
  claimedAt?: Date | null;
};

export function inboxValues(args: {
  userId: string;
  payload: InboxPayload;
  message?: string | null;
  listingId?: number | null;
  fromUserId?: string | null;
  fromName?: string | null;
  claimedAt?: Date | null;
}): InboxInsertValues {
  const { payload, ...rest } = args;
  const { kind, ...body } = payload;
  return { ...rest, kind, payload: body };
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function asNonNegInt(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return null;
  return Math.trunc(v);
}

function parseRewardMaterials(v: unknown): GuildQuestRewardMaterial[] {
  if (!Array.isArray(v)) return [];
  const out: GuildQuestRewardMaterial[] = [];
  for (const m of v) {
    if (typeof m !== "object" || m === null) continue;
    const r = m as Record<string, unknown>;
    const materialId = asString(r.materialId);
    const count = asNonNegInt(r.count);
    if (materialId && count != null && count > 0) {
      out.push({ materialId, count });
    }
  }
  return out;
}

function parseRewardItems(v: unknown): GuildQuestRewardItem[] {
  if (!Array.isArray(v)) return [];
  const out: GuildQuestRewardItem[] = [];
  for (const it of v) {
    if (typeof it !== "object" || it === null) continue;
    const r = it as Record<string, unknown>;
    const itemId = asString(r.itemId);
    const count = asNonNegInt(r.count);
    if (itemId && count != null && count > 0) {
      out.push({ itemId, count });
    }
  }
  return out;
}

function parseRewardCashItems(v: unknown): AdminGiftCashItem[] {
  if (!Array.isArray(v)) return [];
  const out: AdminGiftCashItem[] = [];
  for (const item of v) {
    if (typeof item !== "object" || item === null) continue;
    const row = item as Record<string, unknown>;
    const itemId = asString(row.itemId);
    const count = asNonNegInt(row.count);
    if (
      itemId &&
      isMuseunAdminGiftItemId(itemId) &&
      count != null &&
      count > 0
    ) {
      out.push({ itemId, count });
    }
  }
  return out;
}

function parseRewardTitleIds(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out = new Set<string>();
  for (const value of v) {
    if (
      typeof value === "string" &&
      Object.prototype.hasOwnProperty.call(TITLES, value)
    ) {
      out.add(value);
    }
  }
  return [...out];
}
