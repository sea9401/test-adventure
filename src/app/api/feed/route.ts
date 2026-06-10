// /api/feed — 전체 소식(서버 피드).
//
//   GET   → 최근 항목 + 내 공유 설정.  { entries: FeedEntry[], share: boolean }
//           ?types=war — 전쟁 사건(outpost_*)만 (전광판 티커 소비).
//   POST  → 클라이언트가 라이브 드랍을 보고. body { type: "unique_drop", itemId: string }
//           - 서버가 itemId 의 rarity 가 실제 unique 인지 검증(가벼운 스푸핑 방지) 후 insert.
//           - 디바운스/opt-out 으로 실제로 안 들어가도 { ok: true } 반환.
//   PATCH → 내 공유 설정 토글. body { share: boolean } → { ok: true, share }
//
// 걸작 제작은 서버 권위(/api/craft) 에서 직접 insertFeedEntry — 클라 POST 로는 받지 않는다.

import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { serverFeed, users } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { insertFeedEntry } from "@/lib/server/serverFeed";
import {
  FEED_FETCH_LIMIT,
  WAR_FEED_TYPES,
  type FeedEntry,
} from "@/lib/feed-config";
import { ITEMS, isLuckyFind } from "@/adventure/data/items";

export async function GET(req: Request) {
  const userId = await ensureUser();
  if (!userId) return new Response("unauthorized", { status: 401 });

  // ?types=war — 전쟁 사건(outpost_*)만. 서버 필터라 자랑거리 도배에 밀리지 않고
  // 최근 전쟁 사건을 FEED_FETCH_LIMIT 개까지 온전히 받는다.
  const warOnly = new URL(req.url).searchParams.get("types") === "war";

  const [u] = await db
    .select({ shareFeed: users.shareFeed })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const baseQuery = db
    .select({
      id: serverFeed.id,
      type: serverFeed.type,
      actorName: serverFeed.actorName,
      payload: serverFeed.payload,
      createdAt: serverFeed.createdAt,
    })
    .from(serverFeed);
  const rows = await (warOnly
    ? baseQuery.where(inArray(serverFeed.type, [...WAR_FEED_TYPES]))
    : baseQuery
  )
    .orderBy(desc(serverFeed.id))
    .limit(FEED_FETCH_LIMIT);

  const entries: FeedEntry[] = rows
    .map((r) => ({
      id: r.id,
      type: r.type as FeedEntry["type"],
      actorName: r.actorName,
      payload: r.payload as FeedEntry["payload"],
      createdAt: r.createdAt.getTime(),
    }))
    .reverse();

  return Response.json({ entries, share: u?.shareFeed ?? true });
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) return new Response("unauthorized", { status: 401 });

  let body: { type?: unknown; itemId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  // v1: 클라이언트가 보고할 수 있는 건 unique_drop 뿐.
  if (body.type !== "unique_drop") {
    return new Response("unsupported type", { status: 400 });
  }
  const itemId = typeof body.itemId === "string" ? body.itemId : "";
  const item = ITEMS[itemId as keyof typeof ITEMS] as
    | Parameters<typeof isLuckyFind>[0]
    | undefined;
  if (!item || !isLuckyFind(item)) {
    return new Response("not a unique item", { status: 400 });
  }

  await insertFeedEntry(userId, "unique_drop", { itemId });
  return Response.json({ ok: true });
}

export async function PATCH(req: Request) {
  const userId = await ensureUser();
  if (!userId) return new Response("unauthorized", { status: 401 });

  let body: { share?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return new Response("invalid json", { status: 400 });
  }
  if (typeof body.share !== "boolean") {
    return new Response("invalid share", { status: 400 });
  }

  await db
    .update(users)
    .set({ shareFeed: body.share })
    .where(eq(users.id, userId));
  return Response.json({ ok: true, share: body.share });
}
