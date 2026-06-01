import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import {
  TREASURE_COLLECTION_KEY,
  parseTreasureCollection,
} from "@/adventure/v2/treasureCollection";
import {
  TREASURE_FRAGMENTS_KEY,
  parseTreasureFragments,
} from "@/adventure/v2/treasureFragments";

// GET /api/v2/treasure/collection — 발굴한 골동품 인스턴스 목록 + 지도 조각 보유 수.
// 인스턴스는 raw({instanceId, antiqueId, condition, foundAt}) 로만 — 표시값(이름/티어/감정가)은
// 클라가 카탈로그(ANTIQUES)로 enrich. 거래소(PR-5)는 같은 보관함을 상장 원천으로 쓴다.
export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const [colRow, fragRow] = await Promise.all([
    db
      .select({ value: savesKv.value })
      .from(savesKv)
      .where(and(eq(savesKv.userId, userId), eq(savesKv.key, TREASURE_COLLECTION_KEY)))
      .limit(1)
      .then((rows) => rows[0]),
    db
      .select({ value: savesKv.value })
      .from(savesKv)
      .where(and(eq(savesKv.userId, userId), eq(savesKv.key, TREASURE_FRAGMENTS_KEY)))
      .limit(1)
      .then((rows) => rows[0]),
  ]);

  const collection = parseTreasureCollection(colRow?.value);
  const fragments = parseTreasureFragments(fragRow?.value).fragments;
  return Response.json({ ok: true, instances: collection.instances, fragments });
}
