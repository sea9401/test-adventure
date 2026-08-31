// /api/feed — 전체 소식(서버 피드).
//
//   GET   → 최근 항목.  { entries: FeedEntry[], hasMore: boolean }
//           ?types=war — 전광판 묶음(전쟁+고강) (전광판 티커 소비).
//           ?category=acquisition|war|boss — 패널 분류별 보기(서버 필터 —
//           FEED_FETCH_LIMIT 안에서 다른 분류에 밀리지 않게).
//           ?before=<id> — 해당 id보다 오래된 항목을 이어서 조회(cursor pagination).
//   POST  → 클라이언트가 라이브 드랍을 보고. body { type: "unique_drop", itemId: string }
//           - 서버가 itemId 의 rarity 가 실제 unique 인지 검증(가벼운 스푸핑 방지) 후 insert.
//           - 디바운스로 실제로 안 들어가도 { ok: true } 반환.
//
// 옛 PATCH(내 소식 공유 opt-out)는 제거 — 피드는 항상 기록(사용자 결정 2026-06-13).
// 걸작 제작은 서버 권위(/api/craft) 에서 직접 insertFeedEntry — 클라 POST 로는 받지 않는다.

import { and, desc, gte, inArray, lt, notInArray } from "drizzle-orm";
import { db } from "@/db";
import { serverFeed } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { insertFeedEntry } from "@/lib/server/serverFeed";
import {
  FEED_CATEGORY_TYPES,
  FEED_FETCH_LIMIT,
  FEED_HIDDEN_TYPES,
  FEED_RETENTION_MS,
  WAR_FEED_TYPES,
  parseFeedBeforeId,
  parseFeedCategory,
  type FeedEntry,
} from "@/lib/feed-config";
import { ITEMS, isLuckyFind } from "@/adventure/data/items";
import { COOKING_PUBLIC_RECIPE_BY_ID } from "@/adventure/v2/cooking/catalog";

function publicFeedPayload(type: FeedEntry["type"], payload: FeedEntry["payload"]) {
  if (type !== "cooking_discovery") return payload;
  const recipeId = (payload as { recipeId?: unknown }).recipeId;
  const recipe = typeof recipeId === "string"
    ? COOKING_PUBLIC_RECIPE_BY_ID.get(recipeId)
    : null;
  return recipe
    ? { recipeId: recipe.id, recipeName: recipe.name }
    : { recipeId: "", recipeName: "이름이 공개된 요리" };
}

export async function GET(req: Request) {
  const userId = await ensureUser();
  if (!userId) return new Response("unauthorized", { status: 401 });

  // 서버 필터 — 도배에 밀리지 않고 그 묶음의 최근 FEED_FETCH_LIMIT 개를 온전히 받는다.
  //   ?types=war  = 전광판 묶음(전쟁+고강, WarTicker)
  //   ?category=  = 패널 분류별 보기(획득/전쟁/보스)
  const params = new URL(req.url).searchParams;
  const warOnly = params.get("types") === "war";
  const category = parseFeedCategory(params.get("category"));
  const beforeParam = params.get("before");
  const beforeId = beforeParam === null ? null : parseFeedBeforeId(beforeParam);
  if (beforeParam !== null && beforeId === null) {
    return new Response("invalid cursor", { status: 400 });
  }
  const typeFilter = warOnly
    ? [...WAR_FEED_TYPES]
    : category
      ? [...FEED_CATEGORY_TYPES[category]]
      : null;

  const baseQuery = db
    .select({
      id: serverFeed.id,
      type: serverFeed.type,
      actorName: serverFeed.actorName,
      payload: serverFeed.payload,
      createdAt: serverFeed.createdAt,
    })
    .from(serverFeed);
  const visibilityFilter = typeFilter
    ? inArray(serverFeed.type, typeFilter)
    : notInArray(serverFeed.type, [...FEED_HIDDEN_TYPES]);
  const retentionFilter = gte(
    serverFeed.createdAt,
    new Date(Date.now() - FEED_RETENTION_MS),
  );
  const rows = await baseQuery
    .where(
      beforeId === null
        ? and(visibilityFilter, retentionFilter)
        : and(visibilityFilter, retentionFilter, lt(serverFeed.id, beforeId)),
    )
    .orderBy(desc(serverFeed.id))
    .limit(FEED_FETCH_LIMIT + 1);

  const hasMore = rows.length > FEED_FETCH_LIMIT;
  const pageRows = hasMore ? rows.slice(0, FEED_FETCH_LIMIT) : rows;

  const entries: FeedEntry[] = pageRows
    .map((r) => ({
      id: r.id,
      type: r.type as FeedEntry["type"],
      actorName: r.actorName,
      payload: publicFeedPayload(
        r.type as FeedEntry["type"],
        r.payload as FeedEntry["payload"],
      ),
      createdAt: r.createdAt.getTime(),
    }))
    .reverse();

  return Response.json({ entries, hasMore });
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
