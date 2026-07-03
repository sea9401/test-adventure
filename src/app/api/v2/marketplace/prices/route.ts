import { and, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { marketplaceListingsV2 } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import { MARKETPLACE_V2_PRICE_HISTORY_DAYS } from "@/lib/server/marketplaceV2";
import { marketplacePriceKeyForPayload } from "@/adventure/data/v2/marketplacePriceKeys";

const PRICE_CACHE_MS = 30_000;

type PricesPayload = {
  ok: true;
  days: number;
  prices: Record<string, { n: number; avg: number; min: number; max: number }>;
};

let pricesCache:
  | {
      computedAt: number;
      value: PricesPayload;
      inFlight?: Promise<PricesPayload>;
    }
  | undefined;

async function loadPricesPayload(): Promise<PricesPayload> {
  const now = Date.now();
  if (pricesCache && now - pricesCache.computedAt < PRICE_CACHE_MS) {
    return pricesCache.value;
  }
  if (pricesCache?.inFlight) return pricesCache.inFlight;

  const inFlight = loadPricesPayloadFresh().finally(() => {
    if (pricesCache?.inFlight === inFlight) {
      pricesCache = { value: pricesCache.value, computedAt: pricesCache.computedAt };
    }
  });
  pricesCache = {
    computedAt: pricesCache?.computedAt ?? 0,
    value: pricesCache?.value ?? { ok: true, days: MARKETPLACE_V2_PRICE_HISTORY_DAYS, prices: {} },
    inFlight,
  };
  return inFlight;
}

async function loadPricesPayloadFresh(): Promise<PricesPayload> {
  const since = new Date(Date.now() - MARKETPLACE_V2_PRICE_HISTORY_DAYS * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      itemId: marketplaceListingsV2.itemId,
      kind: marketplaceListingsV2.kind,
      price: marketplaceListingsV2.price,
      instancePayload: marketplaceListingsV2.instancePayload,
    })
    .from(marketplaceListingsV2)
    .where(
      and(
        eq(marketplaceListingsV2.status, "sold"),
        gte(marketplaceListingsV2.closedAt, since),
      ),
    );

  const prices: PricesPayload["prices"] = {};
  const buckets = new Map<string, number[]>();
  for (const r of rows) {
    const keys = new Set([r.itemId]);
    if (r.kind === "equip") {
      keys.add(marketplacePriceKeyForPayload(r.itemId, r.instancePayload));
    }
    for (const key of keys) {
      const bucket = buckets.get(key) ?? [];
      bucket.push(r.price);
      buckets.set(key, bucket);
    }
  }
  for (const [key, values] of buckets) {
    prices[key] = {
      n: values.length,
      avg: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length),
      min: Math.min(...values),
      max: Math.max(...values),
    };
  }

  const payload: PricesPayload = {
    ok: true,
    days: MARKETPLACE_V2_PRICE_HISTORY_DAYS,
    prices,
  };
  pricesCache = { computedAt: Date.now(), value: payload };
  return payload;
}

// GET /api/v2/marketplace/prices — 시세(최근 거래가). 종목별 판매 완료(sold) 집계.
//   최근 N일(MARKETPLACE_V2_PRICE_HISTORY_DAYS) 동안 status='sold' 인 매물을 itemId 로 묶어
//   건수·평균·최저·최고가 반환. UI 가 itemId 로 조회해 가격 판단 참고로 표시.
// 장비는 itemId 전체 평균과 함께 제작 상태별 키(itemId#crafted/#quality1/#quality2/#masterwork/#craftOnly)를
// 같이 내려준다. UI 는 동급 키를 우선 쓰고 없으면 기존 itemId 평균으로 fallback 한다.
export async function GET(req: Request) {
  const userId = await ensureUser();
  if (!userId) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:marketplace:prices",
    userLimit: 120,
    ipLimit: 800,
    windowMs: 60_000,
  });
  if (limited) return limited;

  return Response.json(await loadPricesPayload());
}
