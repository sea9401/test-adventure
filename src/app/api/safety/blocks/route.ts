import { and, desc, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { chatRoomInvites, chatRoomMembers, userBlocks } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { resolveUgcSource } from "@/lib/server/ugcSafety";
import { isUgcSourceType, normalizeUgcSourceId } from "@/lib/ugc-safety";

export async function GET() {
  const userId = await ensureUser();
  if (!userId) return new Response("unauthorized", { status: 401 });

  const rows = await db
    .select({
      userId: userBlocks.blockedUserId,
      name: userBlocks.blockedName,
      createdAt: userBlocks.createdAt,
    })
    .from(userBlocks)
    .where(eq(userBlocks.blockerUserId, userId))
    .orderBy(desc(userBlocks.createdAt));

  return Response.json({
    blocks: rows.map((row) => ({
      userId: row.userId,
      name: row.name,
      createdAt: row.createdAt.getTime(),
    })),
  });
}

export async function POST(req: Request) {
  const blockerUserId = await ensureUser();
  if (!blockerUserId) return new Response("unauthorized", { status: 401 });

  let body: { sourceType?: unknown; sourceId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return new Response("invalid json", { status: 400 });
  }
  if (!isUgcSourceType(body.sourceType)) {
    return new Response("invalid source type", { status: 400 });
  }
  const sourceId = normalizeUgcSourceId(body.sourceId);
  if (!sourceId) {
    return new Response("invalid source id", { status: 400 });
  }

  const target = await resolveUgcSource(
    blockerUserId,
    body.sourceType,
    sourceId,
  );
  if (!target) return new Response("not found", { status: 404 });
  if (target.targetUserId === blockerUserId) {
    return new Response("cannot block self", { status: 400 });
  }

  await db.transaction(async (tx) => {
    await tx
      .insert(userBlocks)
      .values({
        blockerUserId,
        blockedUserId: target.targetUserId,
        blockedName: target.targetName,
      })
      .onConflictDoUpdate({
        target: [userBlocks.blockerUserId, userBlocks.blockedUserId],
        set: { blockedName: target.targetName, createdAt: new Date() },
      });

    // 양쪽 사이에 대기 중인 채팅방 초대가 있다면 즉시 목록에서 제거한다.
    await tx
      .update(chatRoomInvites)
      .set({ status: "declined" })
      .where(
        and(
          eq(chatRoomInvites.status, "pending"),
          or(
            and(
              eq(chatRoomInvites.fromUserId, blockerUserId),
              eq(chatRoomInvites.toUserId, target.targetUserId),
            ),
            and(
              eq(chatRoomInvites.fromUserId, target.targetUserId),
              eq(chatRoomInvites.toUserId, blockerUserId),
            ),
          ),
        ),
      );

    // 채팅방 정보에서 방장을 차단한 경우 해당 방에서도 즉시 나가 방 이름과 대화가
    // 다시 노출되지 않게 한다. 방장은 자기 자신을 차단할 수 없으므로 소유권 문제는 없다.
    if (target.sourceType === "chat_room") {
      const roomId = Number(target.sourceId);
      if (Number.isSafeInteger(roomId) && roomId > 0) {
        await tx
          .delete(chatRoomMembers)
          .where(
            and(
              eq(chatRoomMembers.roomId, roomId),
              eq(chatRoomMembers.userId, blockerUserId),
            ),
          );
      }
    }
  });

  return Response.json({
    ok: true,
    blockedUserId: target.targetUserId,
    blockedName: target.targetName,
  });
}

export async function DELETE(req: Request) {
  const blockerUserId = await ensureUser();
  if (!blockerUserId) return new Response("unauthorized", { status: 401 });

  let body: { userId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return new Response("invalid json", { status: 400 });
  }
  if (typeof body.userId !== "string" || body.userId.length === 0) {
    return new Response("invalid user id", { status: 400 });
  }

  await db
    .delete(userBlocks)
    .where(
      and(
        eq(userBlocks.blockerUserId, blockerUserId),
        eq(userBlocks.blockedUserId, body.userId),
      ),
    );
  return Response.json({ ok: true });
}
