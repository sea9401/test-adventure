import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { marketplaceListingsV2 } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import {
  MARKETPLACE_V2_HISTORY_LIMIT,
  currentMarketplaceItemName,
} from "@/lib/server/marketplaceV2";

const HISTORY_CACHE_MS = 15_000;

type HistoryPayload = {
  ok: true;
  trades: Array<{
    id: number;
    sellerName: string | null;
    kind: string;
    itemId: string;
    itemName: string;
    quantity: number;
    price: number;
    instancePayload: unknown;
    closedAt: Date | null;
  }>;
};

let historyCache:
  | {
      computedAt: number;
      value: HistoryPayload;
      inFlight?: Promise<HistoryPayload>;
    }
  | undefined;

async function loadHistoryPayload(): Promise<HistoryPayload> {
  const now = Date.now();
  if (historyCache && now - historyCache.computedAt < HISTORY_CACHE_MS) {
    return historyCache.value;
  }
  if (historyCache?.inFlight) return historyCache.inFlight;

  const inFlight = loadHistoryPayloadFresh().finally(() => {
    if (historyCache?.inFlight === inFlight) {
      historyCache = { value: historyCache.value, computedAt: historyCache.computedAt };
    }
  });
  historyCache = {
    computedAt: historyCache?.computedAt ?? 0,
    value: historyCache?.value ?? { ok: true, trades: [] },
    inFlight,
  };
  return inFlight;
}

async function loadHistoryPayloadFresh(): Promise<HistoryPayload> {
  const rows = await db
    .select({
      id: marketplaceListingsV2.id,
      sellerName: marketplaceListingsV2.sellerName,
      kind: marketplaceListingsV2.kind,
      itemId: marketplaceListingsV2.itemId,
      itemName: marketplaceListingsV2.itemName,
      quantity: marketplaceListingsV2.quantity,
      price: marketplaceListingsV2.price,
      instancePayload: marketplaceListingsV2.instancePayload,
      closedAt: marketplaceListingsV2.closedAt,
    })
    .from(marketplaceListingsV2)
    .where(
      and(
        eq(marketplaceListingsV2.status, "sold"),
        isNotNull(marketplaceListingsV2.closedAt),
      ),
    )
    .orderBy(desc(marketplaceListingsV2.closedAt))
    .limit(MARKETPLACE_V2_HISTORY_LIMIT);

  const payload: HistoryPayload = {
    ok: true,
    trades: rows.map((row) => ({
      ...row,
      itemName: currentMarketplaceItemName(
        row.kind,
        row.itemId,
        row.itemName,
      ),
    })),
  };
  historyCache = { computedAt: Date.now(), value: payload };
  return payload;
}

// GET /api/v2/marketplace/history — 최근 체결된 거래(거래소 "최근 거래" 탭).
//   status='sold' 매물을 체결 시각(closedAt) 최신순, 최대 MARKETPLACE_V2_HISTORY_LIMIT.
//   공개 정보(판매자명·아이템·체결가·시각)만 — 구매자(buyerId)는 비노출(프라이버시).
export async function GET(req: Request) {
  const userId = await ensureUser();
  if (!userId)
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:marketplace:history",
    userLimit: 120,
    ipLimit: 800,
    windowMs: 60_000,
  });
  if (limited) return limited;

  return Response.json(await loadHistoryPayload());
}
