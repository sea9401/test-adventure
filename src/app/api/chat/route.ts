import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { messages } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { recordUserChatMessageInTx } from "@/lib/server/chatProgress";
import { resolveActor } from "@/lib/server/resolveActor";
import { getViewerGuild } from "@/lib/server/bulletinAccess";
import {
  CHAT_FETCH_LIMIT,
  CHAT_MAX_LENGTH,
  CHAT_RATE_LIMIT_MS,
} from "@/lib/chat-config";

type ChatChannel = "global" | "guild";

function parseChannel(value: string | null): ChatChannel {
  return value === "guild" ? "guild" : "global";
}

export async function GET(req: Request) {
  const userId = await ensureUser();
  if (!userId) return new Response("unauthorized", { status: 401 });
  const channel = parseChannel(new URL(req.url).searchParams.get("channel"));
  const viewerGuild =
    channel === "guild" ? await getViewerGuild(db, userId) : null;
  if (channel === "guild" && viewerGuild == null) {
    return new Response("not in guild", { status: 403 });
  }

  const rows = await db
    .select({
      id: messages.id,
      channel: messages.channel,
      name: messages.name,
      className: messages.className,
      title: messages.title,
      content: messages.content,
      createdAt: messages.createdAt,
      mine: messages.userId,
    })
    .from(messages)
    .where(
      channel === "guild"
        ? and(
            eq(messages.channel, "guild"),
            eq(messages.guildId, viewerGuild?.guildId ?? -1),
          )
        : and(eq(messages.channel, "global"), isNull(messages.guildId)),
    )
    .orderBy(desc(messages.createdAt))
    .limit(CHAT_FETCH_LIMIT);

  const result = rows
    .map((r) => ({
      id: r.id,
      channel: r.channel === "guild" ? "guild" : "global",
      name: r.name,
      className: r.className,
      title: r.title,
      content: r.content,
      createdAt: r.createdAt.getTime(),
      mine: r.mine === userId,
    }))
    .reverse();

  return Response.json(result);
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) return new Response("unauthorized", { status: 401 });

  // identity(name/className/title)는 클라 body 무시 — 서버에서 권위로 해석.
  // (이전엔 body 그대로 저장돼 누구나 "관리자" 등으로 사칭 가능했다.)
  let body: { content?: unknown; channel?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return new Response("invalid json", { status: 400 });
  }
  const channel = body.channel === "guild" ? "guild" : "global";
  const viewerGuild =
    channel === "guild" ? await getViewerGuild(db, userId) : null;
  if (channel === "guild" && viewerGuild == null) {
    return new Response("not in guild", { status: 403 });
  }

  const content =
    typeof body.content === "string" ? body.content.trim() : "";
  if (!content) return new Response("empty content", { status: 400 });
  if (content.length > CHAT_MAX_LENGTH) {
    return new Response(`too long (max ${CHAT_MAX_LENGTH})`, { status: 400 });
  }

  const { name, className, title } = await resolveActor(userId);

  const since = new Date(Date.now() - CHAT_RATE_LIMIT_MS);
  const [lastRow] = await db
    .select({ createdAt: messages.createdAt })
    .from(messages)
    .where(eq(messages.userId, userId))
    .orderBy(desc(messages.createdAt))
    .limit(1);
  if (lastRow && lastRow.createdAt > since) {
    return new Response("rate limited", { status: 429 });
  }

  const inserted = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(messages)
      .values({
        userId,
        channel,
        guildId: channel === "guild" ? (viewerGuild?.guildId ?? null) : null,
        name,
        className,
        title,
        content,
      })
      .returning({
        id: messages.id,
        createdAt: messages.createdAt,
      });
    if (channel === "global") {
      await recordUserChatMessageInTx(tx, userId, row.createdAt.getTime());
    }
    return row;
  });

  return Response.json({
    id: inserted.id,
    channel,
    name,
    className,
    title,
    content,
    createdAt: inserted.createdAt.getTime(),
    mine: true,
  });
}
