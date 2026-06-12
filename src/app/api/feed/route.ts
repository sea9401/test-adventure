// /api/feed — 전체 소식(서버 피드).
//
//   GET   → 최근 항목.  { entries: FeedEntry[] }
//           ?types=war — 전쟁 사건(outpost_*)만 (전광판 티커 소비).
//   POST  → 클라이언트가 라이브 드랍을 보고. body { type: "unique_drop", itemId: string }
//           - 서버가 itemId 의 rarity 가 실제 unique 인지 검증(가벼운 스푸핑 방지) 후 insert.
//           - 디바운스로 실제로 안 들어가도 { ok: true } 반환.
//
// 옛 PATCH(내 소식 공유 opt-out)는 제거 — 피드는 항상 기록(사용자 결정 2026-06-13).
// 걸작 제작은 서버 권위(/api/craft) 에서 직접 insertFeedEntry — 클라 POST 로는 받지 않는다.

import { desc, inArray } from "drizzle-orm";
import { db } from "@/db";
import { serverFeed } from "@/db/schema";
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

  return Response.json({ entries });
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
