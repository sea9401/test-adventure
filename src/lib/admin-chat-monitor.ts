import type { ChatEquipmentLink } from "@/lib/chat-item-link";

export type AdminChatKind = "global" | "trade" | "guild" | "room";
export type AdminChatRoomsKind = "all" | AdminChatKind;
export type AdminChatVisibility = "all" | "public" | "private";

export type AdminChatRoomsQuery = {
  kind: AdminChatRoomsKind;
  visibility: AdminChatVisibility;
  q: string;
  offset: number;
  limit: number;
};

export type AdminChatMessagesQuery = {
  kind: AdminChatKind;
  scopeId: number | null;
  beforeId: number | null;
  limit: number;
};

type FixedAdminChatTarget = {
  targetKey: "global" | "trade";
  kind: "global" | "trade";
  label: string;
  latestMessageAt: string | null;
};

export type GuildAdminChatTarget = {
  targetKey: `guild:${number}`;
  kind: "guild";
  scopeId: number;
  label: string;
  latestMessageAt: string | null;
};

export type RoomAdminChatTarget = {
  targetKey: `room:${number}`;
  kind: "room";
  scopeId: number;
  label: string;
  visibility: "public" | "private";
  ownerId: string;
  ownerName: string;
  memberCount: number;
  latestMessageAt: string | null;
};

export type AdminChatTarget =
  | FixedAdminChatTarget
  | GuildAdminChatTarget
  | RoomAdminChatTarget;

export type AdminChatParticipant = {
  userId: string;
  name: string;
  role: "owner" | "member";
  joinedAt: string;
};

export type AdminChatMessage = {
  id: number;
  authorUserId: string;
  name: string;
  className: string;
  title: string | null;
  content: string;
  itemLink: ChatEquipmentLink | null;
  createdAt: string;
};

export type AdminChatRoomsResponse = {
  targets: AdminChatTarget[];
  total: number;
  hasMore: boolean;
};

export type AdminChatMessagesResponse = {
  target: AdminChatTarget;
  participants: AdminChatParticipant[] | null;
  messages: AdminChatMessage[];
  hasMore: boolean;
  nextBeforeId: number | null;
};

type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const ROOM_KINDS = new Set<AdminChatRoomsKind>([
  "all",
  "global",
  "trade",
  "guild",
  "room",
]);
const MESSAGE_KINDS = new Set<AdminChatKind>([
  "global",
  "trade",
  "guild",
  "room",
]);
const VISIBILITIES = new Set<AdminChatVisibility>([
  "all",
  "public",
  "private",
]);

export function parseAdminChatRoomsQuery(
  searchParams: URLSearchParams,
): ParseResult<AdminChatRoomsQuery> {
  const rawKind = searchParams.get("kind") ?? "all";
  if (!ROOM_KINDS.has(rawKind as AdminChatRoomsKind)) {
    return { ok: false, error: "invalid kind" };
  }
  const rawVisibility = searchParams.get("visibility") ?? "all";
  if (!VISIBILITIES.has(rawVisibility as AdminChatVisibility)) {
    return { ok: false, error: "invalid visibility" };
  }
  const offset = Number(searchParams.get("offset") ?? 0);
  if (!Number.isSafeInteger(offset) || offset < 0) {
    return { ok: false, error: "invalid offset" };
  }
  const limit = Number(searchParams.get("limit") ?? 50);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    return { ok: false, error: "invalid limit" };
  }
  return {
    ok: true,
    value: {
      kind: rawKind as AdminChatRoomsKind,
      visibility: rawVisibility as AdminChatVisibility,
      q: (searchParams.get("q") ?? "").trim().slice(0, 100),
      offset,
      limit,
    },
  };
}

export function parseAdminChatMessagesQuery(
  searchParams: URLSearchParams,
): ParseResult<AdminChatMessagesQuery> {
  const rawKind = searchParams.get("kind");
  if (!rawKind || !MESSAGE_KINDS.has(rawKind as AdminChatKind)) {
    return { ok: false, error: "invalid kind" };
  }
  const kind = rawKind as AdminChatKind;
  const rawScopeId = searchParams.get("scopeId");
  const scopeId = rawScopeId == null ? null : Number(rawScopeId);
  if (
    (kind === "guild" || kind === "room") &&
    (!Number.isSafeInteger(scopeId) || Number(scopeId) <= 0)
  ) {
    return { ok: false, error: "invalid scope id" };
  }
  if ((kind === "global" || kind === "trade") && rawScopeId != null) {
    return { ok: false, error: "unexpected scope id" };
  }
  const rawBeforeId = searchParams.get("beforeId");
  const beforeId = rawBeforeId == null ? null : Number(rawBeforeId);
  if (
    beforeId != null &&
    (!Number.isSafeInteger(beforeId) || beforeId <= 0)
  ) {
    return { ok: false, error: "invalid before id" };
  }
  const limit = Number(searchParams.get("limit") ?? 100);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    return { ok: false, error: "invalid limit" };
  }
  return {
    ok: true,
    value: { kind, scopeId, beforeId, limit },
  };
}
