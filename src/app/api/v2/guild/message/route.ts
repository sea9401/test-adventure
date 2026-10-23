import { and, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import {
  GUILD_MESSAGE_DAILY_LIMIT,
  GUILD_MESSAGE_MAX_LENGTH,
} from "@/adventure/data/guild";
import { db } from "@/db";
import {
  guildMembers,
  guilds,
  marketplaceInbox,
  userBlocks,
  users,
} from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { isManagerRole } from "@/lib/server/guildAdmin";
import { inboxValues } from "@/lib/server/inboxPayload";
import {
  TradeSuspendedError,
  requireTradeParticipants,
  tradeSuspendedResponse,
} from "@/lib/server/tradeSuspension";
import { requireCurrentUgcConsent } from "@/lib/server/ugcSafety";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";

// /api/v2/guild/message — 길드 쪽지(건의 #799). 마스터·관리자가 길드원 전체 우편함에 한 번에 보낸다.
//   GET  → { remaining, limit, recipientCount } 오늘 남은 발송 횟수(관리 탭 표시용).
//   POST → body { text } 본인을 뺀 길드원마다 guild_message 우편 1통.
// 횟수는 길드 단위 24시간 GUILD_MESSAGE_DAILY_LIMIT 회. 한 번의 발송은 모든 행을 같은
// createdAt 으로 적재하고, 현재 길드원이 보낸 이 길드의 guild_message 를 서로 다른 발송
// 시각 수로 센다. 길드 행을 FOR UPDATE 로 잠가 동시 발송이 한도를 넘지 못하게 한다.
// 어느 쪽이든 발신자와 차단 관계인 길드원은 받는 대상에서 뺀다.

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const DAY_MS = 24 * 60 * 60 * 1000;

type SenderGuild =
  | { error: "no_guild" | "not_manager"; status: 403 }
  | { error: "guild_not_found"; status: 404 }
  | { guildId: number; guildName: string };

async function readSenderGuild(
  tx: Tx,
  userId: string,
  lock: boolean,
): Promise<SenderGuild> {
  const [member] = await tx
    .select({ guildId: guildMembers.guildId, role: guildMembers.role })
    .from(guildMembers)
    .where(eq(guildMembers.userId, userId))
    .limit(1);
  if (!member) return { error: "no_guild", status: 403 };

  const guildQuery = tx
    .select({ masterId: guilds.masterId, name: guilds.name })
    .from(guilds)
    .where(and(eq(guilds.id, member.guildId), isNull(guilds.disbandedAt)));
  const [guild] = await (lock ? guildQuery.for("update") : guildQuery).limit(1);
  if (!guild) return { error: "guild_not_found", status: 404 };
  if (guild.masterId !== userId && !isManagerRole(member.role)) {
    return { error: "not_manager", status: 403 };
  }
  return { guildId: member.guildId, guildName: guild.name };
}

async function readMemberIds(tx: Tx, guildId: number): Promise<string[]> {
  const rows = await tx
    .select({ userId: guildMembers.userId })
    .from(guildMembers)
    .where(eq(guildMembers.guildId, guildId));
  return rows.map((row) => row.userId);
}

async function countSentToday(
  tx: Tx,
  guildId: number,
  memberIds: string[],
  now: Date,
): Promise<number> {
  if (memberIds.length === 0) return 0;
  const [row] = await tx
    .select({
      n: sql<number>`count(distinct ${marketplaceInbox.createdAt})::int`,
    })
    .from(marketplaceInbox)
    .where(
      and(
        inArray(marketplaceInbox.fromUserId, memberIds),
        eq(marketplaceInbox.kind, "guild_message"),
        gt(marketplaceInbox.createdAt, new Date(now.getTime() - DAY_MS)),
        sql`${marketplaceInbox.payload}->>'guild_id' = ${String(guildId)}`,
      ),
    );
  return row?.n ?? 0;
}

function remainingAfter(sent: number): number {
  return Math.max(0, GUILD_MESSAGE_DAILY_LIMIT - sent);
}

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const result = await db.transaction(async (tx) => {
    const sender = await readSenderGuild(tx, userId, false);
    if ("error" in sender) {
      return { status: sender.status, body: { ok: false as const, error: sender.error } };
    }
    const memberIds = await readMemberIds(tx, sender.guildId);
    const sent = await countSentToday(tx, sender.guildId, memberIds, now);
    return {
      status: 200,
      body: {
        ok: true as const,
        remaining: remainingAfter(sent),
        limit: GUILD_MESSAGE_DAILY_LIMIT,
        recipientCount: memberIds.filter((id) => id !== userId).length,
      },
    };
  });
  return Response.json(result.body, { status: result.status });
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const consentFailure = await requireCurrentUgcConsent(userId);
  if (consentFailure) return consentFailure;

  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:guild:message:send",
    userLimit: 10,
    ipLimit: 60,
    windowMs: 60_000,
  });
  if (limited) return limited;

  let body: { text?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) {
    return Response.json({ ok: false, error: "empty_text" }, { status: 400 });
  }
  if (text.length > GUILD_MESSAGE_MAX_LENGTH) {
    return Response.json(
      { ok: false, error: "text_too_long", maxLength: GUILD_MESSAGE_MAX_LENGTH },
      { status: 400 },
    );
  }

  const now = new Date();
  try {
    const result = await db.transaction(async (tx) => {
      const sender = await readSenderGuild(tx, userId, true);
      if ("error" in sender) {
        return { status: sender.status, body: { ok: false as const, error: sender.error } };
      }
      await requireTradeParticipants(tx, [userId], now);

      const [me] = await tx
        .select({ name: users.gameName })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (!me?.name) {
        return { status: 400, body: { ok: false as const, error: "sender_no_name" } };
      }

      const memberIds = await readMemberIds(tx, sender.guildId);
      const sent = await countSentToday(tx, sender.guildId, memberIds, now);
      if (sent >= GUILD_MESSAGE_DAILY_LIMIT) {
        return {
          status: 429,
          body: {
            ok: false as const,
            error: "daily_limit",
            remaining: 0,
            limit: GUILD_MESSAGE_DAILY_LIMIT,
          },
        };
      }

      const candidates = memberIds.filter((id) => id !== userId);
      const blocks =
        candidates.length === 0
          ? []
          : await tx
              .select({
                blockerUserId: userBlocks.blockerUserId,
                blockedUserId: userBlocks.blockedUserId,
              })
              .from(userBlocks)
              .where(
                or(
                  and(
                    eq(userBlocks.blockerUserId, userId),
                    inArray(userBlocks.blockedUserId, candidates),
                  ),
                  and(
                    inArray(userBlocks.blockerUserId, candidates),
                    eq(userBlocks.blockedUserId, userId),
                  ),
                ),
              );
      const blocked = new Set(
        blocks.map((b) => (b.blockerUserId === userId ? b.blockedUserId : b.blockerUserId)),
      );
      const recipients = candidates.filter((id) => !blocked.has(id));
      if (recipients.length === 0) {
        return { status: 400, body: { ok: false as const, error: "no_recipients" } };
      }

      await tx.insert(marketplaceInbox).values(
        recipients.map((recipientId) =>
          inboxValues({
            userId: recipientId,
            payload: {
              kind: "guild_message",
              text,
              guild_id: sender.guildId,
              guild_name: sender.guildName,
            },
            fromUserId: userId,
            fromName: me.name,
            createdAt: now,
          }),
        ),
      );
      return {
        status: 200,
        body: {
          ok: true as const,
          sentCount: recipients.length,
          remaining: remainingAfter(sent + 1),
          limit: GUILD_MESSAGE_DAILY_LIMIT,
        },
      };
    });
    return Response.json(result.body, { status: result.status });
  } catch (e) {
    if (e instanceof TradeSuspendedError) return tradeSuspendedResponse(e);
    throw e;
  }
}
