import { and, count, desc, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { marketplaceBuyOrdersV2 } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { V2_CORE_LOOP_V2, spendGold } from "@/adventure/data/v2/coreLoopConfig";
import {
  MARKETPLACE_V2_BUY_ORDER_ESCROW_MAX,
  MARKETPLACE_V2_BUY_ORDER_LIMIT,
  MARKETPLACE_V2_BUY_ORDER_MAX_DAYS,
  isMarketKind,
  isStackableMarketplaceItem,
  isTradableMaterial,
  isValidMaterialQty,
  isValidPrice,
  itemDisplayName,
} from "@/lib/server/marketplaceV2";
import {
  matchMarketplaceBuyOrder,
  recordMarketplaceAutoMatchFills,
} from "@/lib/server/marketplaceBuyOrdersV2";
import { recordEconomyEventSoon } from "@/lib/server/economyLog";

type CharSave = {
  gold?: number;
  bankedGold?: number;
  [key: string]: unknown;
};

function bad(error: string, status = 400) {
  return Response.json({ ok: false, error }, { status });
}

export async function GET(req: Request) {
  const userId = await ensureUser();
  if (!userId) return bad("unauthorized", 401);
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:marketplace:buy-orders:get",
    userLimit: 120,
    ipLimit: 800,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const now = new Date();
  const [mine, publicRows] = await Promise.all([
    db
      .select()
      .from(marketplaceBuyOrdersV2)
      .where(eq(marketplaceBuyOrdersV2.buyerId, userId))
      .orderBy(desc(marketplaceBuyOrdersV2.createdAt))
      .limit(50),
    db
      .select({
        kind: marketplaceBuyOrdersV2.kind,
        itemId: marketplaceBuyOrdersV2.itemId,
        itemName: marketplaceBuyOrdersV2.itemName,
        unitPrice: marketplaceBuyOrdersV2.unitPrice,
        quantityRemaining: marketplaceBuyOrdersV2.quantityRemaining,
      })
      .from(marketplaceBuyOrdersV2)
      .where(
        and(
          eq(marketplaceBuyOrdersV2.status, "active"),
          gt(marketplaceBuyOrdersV2.expiresAt, now),
        ),
      )
      .orderBy(desc(marketplaceBuyOrdersV2.unitPrice))
      .limit(300),
  ]);
  const book = new Map<
    string,
    {
      kind: string;
      itemId: string;
      itemName: string;
      bestUnitPrice: number;
      totalQuantity: number;
      orderCount: number;
    }
  >();
  for (const row of publicRows) {
    const key = `${row.kind}:${row.itemId}`;
    const current = book.get(key);
    if (current) {
      current.bestUnitPrice = Math.max(current.bestUnitPrice, row.unitPrice);
      current.totalQuantity += row.quantityRemaining;
      current.orderCount++;
    } else {
      book.set(key, {
        kind: row.kind,
        itemId: row.itemId,
        itemName: row.itemName,
        bestUnitPrice: row.unitPrice,
        totalQuantity: row.quantityRemaining,
        orderCount: 1,
      });
    }
  }
  return Response.json({ ok: true, mine, book: [...book.values()] });
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) return bad("unauthorized", 401);
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:marketplace:buy-orders:create",
    userLimit: 20,
    ipLimit: 120,
    windowMs: 60_000,
  });
  if (limited) return limited;

  let body: {
    kind?: unknown;
    itemId?: unknown;
    quantity?: unknown;
    unitPrice?: unknown;
    days?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return bad("invalid_json");
  }
  if (!isMarketKind(body.kind) || body.kind === "equip") return bad("bad_kind");
  if (typeof body.itemId !== "string") return bad("bad_item");
  if (!isStackableMarketplaceItem(body.kind, body.itemId)) {
    return bad("not_stackable");
  }
  if (body.kind === "material" && !isTradableMaterial(body.itemId)) {
    return bad("not_tradable");
  }
  if (!isValidMaterialQty(body.quantity)) return bad("bad_quantity");
  if (!isValidPrice(body.unitPrice)) return bad("bad_price");
  const days = Number(body.days ?? 3);
  if (!Number.isInteger(days) || days < 1 || days > MARKETPLACE_V2_BUY_ORDER_MAX_DAYS) {
    return bad("bad_days");
  }
  const escrowGold = body.quantity * body.unitPrice;
  if (
    !Number.isSafeInteger(escrowGold) ||
    escrowGold < 1 ||
    escrowGold > MARKETPLACE_V2_BUY_ORDER_ESCROW_MAX
  ) {
    return bad("bad_price");
  }
  const itemName = itemDisplayName(body.kind, body.itemId);
  if (!itemName) return bad("not_tradable");
  const kind = body.kind;
  const itemId = body.itemId;
  const quantity = body.quantity;
  const unitPrice = body.unitPrice;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const result = await db.transaction(async (tx) => {
    const character = await lockSaveForUpdate<CharSave>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const [{ value: activeCount }] = await tx
      .select({ value: count() })
      .from(marketplaceBuyOrdersV2)
      .where(
        and(
          eq(marketplaceBuyOrdersV2.buyerId, userId),
          eq(marketplaceBuyOrdersV2.status, "active"),
        ),
      );
    if (activeCount >= MARKETPLACE_V2_BUY_ORDER_LIMIT) {
      return { status: 400, body: { ok: false as const, error: "order_limit" } };
    }
    const spend = spendGold(
      Math.max(0, Math.floor(character.gold ?? 0)),
      Math.max(0, Math.floor(character.bankedGold ?? 0)),
      escrowGold,
    );
    if (!spend.ok) {
      return { status: 400, body: { ok: false as const, error: "insufficient_gold" } };
    }
    await upsertSave(tx, userId, "character.v2", {
      ...character,
      gold: spend.gold,
      bankedGold: spend.bankedGold,
    });
    const [order] = await tx
      .insert(marketplaceBuyOrdersV2)
      .values({
        buyerId: userId,
        kind,
        itemId,
        itemName,
        unitPrice,
        quantityInitial: quantity,
        quantityRemaining: quantity,
        goldEscrow: escrowGold,
        status: "active",
        createdAt: now,
        expiresAt,
      })
      .returning({ id: marketplaceBuyOrdersV2.id });
    const fills = await matchMarketplaceBuyOrder(tx, order.id, now);
    return {
      status: 200,
      fills,
      body: {
        ok: true as const,
        orderId: order.id,
        escrowGold,
        gold: spend.gold,
        ...(V2_CORE_LOOP_V2 ? { bankedGold: spend.bankedGold } : {}),
      },
    };
  });

  if (result.status === 200 && "fills" in result && result.body.ok) {
    recordEconomyEventSoon({
      userId,
      eventType: "marketplace.buy_order.escrow",
      goldDelta: -escrowGold,
      itemKind: kind,
      itemId,
      quantity,
      detail: { orderId: result.body.orderId, unitPrice },
    });
    recordMarketplaceAutoMatchFills(result.fills ?? []);
  }
  return Response.json(result.body, { status: result.status });
}
