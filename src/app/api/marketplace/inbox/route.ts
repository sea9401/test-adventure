import {
  and,
  desc,
  eq,
  isNotNull,
  isNull,
  notExists,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import { db } from "@/db";
import { marketplaceInbox, userBlocks, users } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import {
  readMuseunCosmeticAppearanceMap,
  readProfileAvatarMap,
} from "@/lib/server/museunCosmetics";
import type { Avatar } from "@/adventure/profile/avatars";
import type { ProfileBorderId } from "@/adventure/data/v2/museunCosmetics";
import {
  ANONYMOUS_MARKETPLACE_MAIL_KINDS,
  PERSONAL_MESSAGE_KINDS,
  visibleInboxSenderName,
} from "@/lib/server/inboxPrivacy";
import { inboxClaimState } from "@/lib/server/inboxPayload";

// 기록(history) 모드에서 한 번에 돌려주는 이미 읽은 우편 수 — 받은 우편 기록 보관용 상한.
const HISTORY_LIMIT = 100;

function visiblePersonalMessageWhere(userId: string) {
  return or(
    notInArray(marketplaceInbox.kind, [...PERSONAL_MESSAGE_KINDS]),
    isNull(marketplaceInbox.fromUserId),
    notExists(
      db
        .select({ one: sql`1` })
        .from(userBlocks)
        .where(
          and(
            eq(userBlocks.blockerUserId, userId),
            eq(userBlocks.blockedUserId, marketplaceInbox.fromUserId),
          ),
        ),
    ),
  );
}

// GET /api/marketplace/inbox — 미완료 전체 + 최근 완료 기록을 합친 받은 우편.
//   ?count=1   → 경량 카운트 모드(미확인 수만 반환, 우편 배지 폴링용 — 전체 행 fetch 회피).
//   ?sent=1    → 보낸 우편 기록. 거래 상대가 드러나는 구매/정산 우편은 제외한다.
export async function GET(req: Request) {
  const userId = await ensureUser();
  if (!userId) return new Response("unauthorized", { status: 401 });

  const params = new URL(req.url).searchParams;

  // 경량 카운트 모드 — 통합 알림 배지 폴링(NotificationBell).
  if (params.get("count") === "1") {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(marketplaceInbox)
      .where(
        and(
          eq(marketplaceInbox.userId, userId),
          isNull(marketplaceInbox.readAt),
          isNull(marketplaceInbox.recipientDeletedAt),
          visiblePersonalMessageWhere(userId),
        ),
      );
    return Response.json({ ok: true, unreadCount: row?.n ?? 0 });
  }

  const sent = params.get("sent") === "1";

  if (sent) {
    const rows = await db
      .select({
        id: marketplaceInbox.id,
        kind: marketplaceInbox.kind,
        payload: marketplaceInbox.payload,
        message: marketplaceInbox.message,
        listingId: marketplaceInbox.listingId,
        fromName: marketplaceInbox.fromName,
        fromUserId: marketplaceInbox.fromUserId,
        recipientUserId: marketplaceInbox.userId,
        recipientName: users.gameName,
        createdAt: marketplaceInbox.createdAt,
        readAt: marketplaceInbox.readAt,
        claimedAt: marketplaceInbox.claimedAt,
      })
      .from(marketplaceInbox)
      .leftJoin(users, eq(users.id, marketplaceInbox.userId))
      .where(
        and(
          eq(marketplaceInbox.fromUserId, userId),
          notInArray(marketplaceInbox.kind, [
            ...ANONYMOUS_MARKETPLACE_MAIL_KINDS,
          ]),
        ),
      )
      .orderBy(desc(marketplaceInbox.createdAt))
      .limit(HISTORY_LIMIT);

    const personOf = await mailPersonResolver(
      rows.map((r) => (r.recipientName ? r.recipientUserId : null)),
    );
    return Response.json({
      items: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        payload: r.payload,
        message: r.message,
        listingId: r.listingId,
        fromName: visibleInboxSenderName(r.kind, r.fromName),
        fromUserId: r.fromUserId,
        recipientName: r.recipientName,
        person: personOf(r.recipientUserId, r.recipientName),
        direction: "sent" as const,
        createdAt: r.createdAt.toISOString(),
        readAt: r.readAt ? r.readAt.toISOString() : null,
        claimedAt: r.claimedAt ? r.claimedAt.toISOString() : null,
        claimState: inboxClaimState(r.kind, r.payload),
        hasReward: inboxClaimState(r.kind, r.payload) === "claimable",
      })),
      unreadCount: 0,
    });
  }

  const fields = {
    id: marketplaceInbox.id,
    kind: marketplaceInbox.kind,
    payload: marketplaceInbox.payload,
    message: marketplaceInbox.message,
    listingId: marketplaceInbox.listingId,
    fromName: marketplaceInbox.fromName,
    fromUserId: marketplaceInbox.fromUserId,
    recipientName: sql<string | null>`null`,
    createdAt: marketplaceInbox.createdAt,
    readAt: marketplaceInbox.readAt,
    claimedAt: marketplaceInbox.claimedAt,
  };

  // 미완료 우편은 상한 없이 보존하고, 완료 기록에만 최근 100개 상한을 둔다.
  const pendingRows = await db
    .select({
      ...fields,
    })
    .from(marketplaceInbox)
    .where(
      and(
        eq(marketplaceInbox.userId, userId),
        isNull(marketplaceInbox.claimedAt),
        isNull(marketplaceInbox.recipientDeletedAt),
        visiblePersonalMessageWhere(userId),
      ),
    )
    .orderBy(desc(marketplaceInbox.createdAt));

  const completedRows = await db
    .select({ ...fields })
    .from(marketplaceInbox)
    .where(
      and(
        eq(marketplaceInbox.userId, userId),
        isNotNull(marketplaceInbox.claimedAt),
        isNull(marketplaceInbox.recipientDeletedAt),
        visiblePersonalMessageWhere(userId),
      ),
    )
    .orderBy(desc(marketplaceInbox.createdAt))
    .limit(HISTORY_LIMIT);

  const rows = [...pendingRows, ...completedRows].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );

  // 카드 맨 앞 프사 — 사람이 보낸 우편에만. 거래소 체결 상대는 익명이라 읽지 않는다.
  const senderIdOf = (r: (typeof rows)[number]) =>
    visibleInboxSenderName(r.kind, r.fromName) ? r.fromUserId : null;
  const personOf = await mailPersonResolver(rows.map(senderIdOf));

  return Response.json({
    items: rows.map((r) => {
      const claimState = inboxClaimState(r.kind, r.payload);
      return {
        id: r.id,
        kind: r.kind,
        payload: r.payload,
        message: r.message,
        listingId: r.listingId,
        fromName: visibleInboxSenderName(r.kind, r.fromName),
        fromUserId: r.fromUserId,
        recipientName: r.recipientName,
        person: personOf(
          senderIdOf(r),
          visibleInboxSenderName(r.kind, r.fromName),
        ),
        direction: "received" as const,
        createdAt: r.createdAt.toISOString(),
        readAt: r.readAt ? r.readAt.toISOString() : null,
        claimedAt: r.claimedAt ? r.claimedAt.toISOString() : null,
        claimState,
        hasReward: claimState === "claimable",
      };
    }),
    unreadCount: rows.filter((row) => row.readAt == null).length,
  });
}

type MailPerson = {
  name: string;
  avatar: Avatar;
  profileBorder: ProfileBorderId | null;
};

/** 우편 목록에 나오는 사람들의 프사·테두리를 한 번에 읽고, 줄마다 꺼내 쓰는 함수를 돌려준다. */
async function mailPersonResolver(userIds: readonly (string | null)[]) {
  const ids = [
    ...new Set(userIds.filter((id): id is string => Boolean(id))),
  ];
  const [avatarByUser, cosmeticByUser] =
    ids.length === 0
      ? [new Map<string, Avatar>(), new Map()]
      : await Promise.all([
          readProfileAvatarMap(ids),
          readMuseunCosmeticAppearanceMap(ids),
        ]);
  return (userId: string | null, name: string | null): MailPerson | null =>
    userId && name
      ? {
          name,
          avatar: avatarByUser.get(userId) ?? "male1",
          profileBorder: cosmeticByUser.get(userId)?.profileBorder ?? null,
        }
      : null;
}
