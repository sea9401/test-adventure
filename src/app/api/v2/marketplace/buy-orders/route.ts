import { and, asc, count, desc, eq, gt, ne } from "drizzle-orm";
import { db } from "@/db";
import { marketplaceBuyOrdersV2, marketplaceInbox } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { V2_CORE_LOOP_V2, spendGold } from "@/adventure/data/v2/coreLoopConfig";
import {
  MARKETPLACE_V2_BUY_ORDER_ESCROW_MAX,
  MARKETPLACE_V2_BUY_ORDER_LIMIT,
  MARKETPLACE_V2_BUY_ORDER_MAX_DAYS,
  equipmentBuyOrderMinimumPrice,
  isMarketKind,
  isStackableMarketplaceItem,
  isTradableMarketplaceMaterial,
  isValidMaterialQty,
  isValidPrice,
  itemDisplayName,
} from "@/lib/server/marketplaceV2";
import {
  matchMarketplaceBuyOrder,
  prepareMarketplaceMatchScope,
  recordMarketplaceAutoMatchFills,
  requireMarketplaceMatchParticipants,
} from "@/lib/server/marketplaceBuyOrdersV2";
import { recordEconomyEventSoon } from "@/lib/server/economyLog";
import { marketplaceBuyOrderEdit } from "@/lib/server/marketplaceBuyOrderEdit";
import { inboxValues } from "@/lib/server/inboxPayload";
import {
  clientIpFromRequest,
  recordAbuseEventSoon,
} from "@/lib/server/abuseLog";
import {
  TradeSuspendedError,
  requireTradeParticipants,
  tradeSuspendedResponse,
} from "@/lib/server/tradeSuspension";

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
  const [mine, publicRows, equipmentRows] = await Promise.all([
    db
      .select()
      .from(marketplaceBuyOrdersV2)
      .where(eq(marketplaceBuyOrdersV2.buyerId, userId))
      .orderBy(desc(marketplaceBuyOrdersV2.createdAt))
      .limit(50),
    db
      .select({
        id: marketplaceBuyOrdersV2.id,
        buyerId: marketplaceBuyOrdersV2.buyerId,
        kind: marketplaceBuyOrdersV2.kind,
        itemId: marketplaceBuyOrdersV2.itemId,
        itemName: marketplaceBuyOrdersV2.itemName,
        unitPrice: marketplaceBuyOrdersV2.unitPrice,
        quantityRemaining: marketplaceBuyOrdersV2.quantityRemaining,
        minPower: marketplaceBuyOrdersV2.minPower,
        minQualityPct: marketplaceBuyOrdersV2.minQualityPct,
        createdAt: marketplaceBuyOrdersV2.createdAt,
        expiresAt: marketplaceBuyOrdersV2.expiresAt,
      })
      .from(marketplaceBuyOrdersV2)
      .where(
        and(
          eq(marketplaceBuyOrdersV2.status, "active"),
          ne(marketplaceBuyOrdersV2.kind, "equip"),
          gt(marketplaceBuyOrdersV2.expiresAt, now),
        ),
      )
      .orderBy(
        desc(marketplaceBuyOrdersV2.unitPrice),
        asc(marketplaceBuyOrdersV2.createdAt),
      )
      .limit(300),
    db
      .select({
        id: marketplaceBuyOrdersV2.id,
        buyerId: marketplaceBuyOrdersV2.buyerId,
        itemId: marketplaceBuyOrdersV2.itemId,
        itemName: marketplaceBuyOrdersV2.itemName,
        unitPrice: marketplaceBuyOrdersV2.unitPrice,
        minPower: marketplaceBuyOrdersV2.minPower,
        minQualityPct: marketplaceBuyOrdersV2.minQualityPct,
        createdAt: marketplaceBuyOrdersV2.createdAt,
        expiresAt: marketplaceBuyOrdersV2.expiresAt,
      })
      .from(marketplaceBuyOrdersV2)
      .where(
        and(
          eq(marketplaceBuyOrdersV2.kind, "equip"),
          eq(marketplaceBuyOrdersV2.status, "active"),
          gt(marketplaceBuyOrdersV2.expiresAt, now),
        ),
      )
      .orderBy(
        desc(marketplaceBuyOrdersV2.unitPrice),
        asc(marketplaceBuyOrdersV2.createdAt),
      )
      .limit(500),
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
      levels: Map<
        number,
        { unitPrice: number; totalQuantity: number; orderCount: number }
      >;
    }
  >();
  for (const row of publicRows) {
    const key = `${row.kind}:${row.itemId}`;
    const current = book.get(key);
    if (current) {
      current.bestUnitPrice = Math.max(current.bestUnitPrice, row.unitPrice);
      current.totalQuantity += row.quantityRemaining;
      current.orderCount++;
      const level = current.levels.get(row.unitPrice);
      if (level) {
        level.totalQuantity += row.quantityRemaining;
        level.orderCount++;
      } else {
        current.levels.set(row.unitPrice, {
          unitPrice: row.unitPrice,
          totalQuantity: row.quantityRemaining,
          orderCount: 1,
        });
      }
    } else {
      book.set(key, {
        kind: row.kind,
        itemId: row.itemId,
        itemName: row.itemName,
        bestUnitPrice: row.unitPrice,
        totalQuantity: row.quantityRemaining,
        orderCount: 1,
        levels: new Map([
          [
            row.unitPrice,
            {
              unitPrice: row.unitPrice,
              totalQuantity: row.quantityRemaining,
              orderCount: 1,
            },
          ],
        ]),
      });
    }
  }
  return Response.json({
    ok: true,
    mine,
    book: [...book.values()].map((row) => ({
      ...row,
      levels: [...row.levels.values()]
        .sort((a, b) => b.unitPrice - a.unitPrice)
        .slice(0, 10),
    })),
    equipmentOrders: equipmentRows
      .filter(
        (row) => row.minPower != null && row.minQualityPct != null,
      )
      .map((row) => ({
        id: row.id,
        isMine: row.buyerId === userId,
        itemId: row.itemId,
        itemName: row.itemName,
        unitPrice: row.unitPrice,
        minPower: row.minPower!,
        minQualityPct: row.minQualityPct!,
        createdAt: row.createdAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
      })),
  });
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
    minPower?: unknown;
    minQualityPct?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return bad("invalid_json");
  }
  if (!isMarketKind(body.kind)) return bad("bad_kind");
  if (typeof body.itemId !== "string") return bad("bad_item");
  if (!isValidPrice(body.unitPrice)) return bad("bad_price");
  const equipOrder = body.kind === "equip";
  if (equipOrder) {
    const minimumPrice = equipmentBuyOrderMinimumPrice(body.itemId);
    if (minimumPrice == null) return bad("not_tradable");
    if (body.unitPrice < minimumPrice) {
      return Response.json(
        { ok: false, error: "price_below_floor", minimumPrice },
        { status: 400 },
      );
    }
    if (
      typeof body.minPower !== "number" ||
      !Number.isInteger(body.minPower) ||
      body.minPower < 1
    ) {
      return bad("bad_min_power");
    }
    if (
      typeof body.minQualityPct !== "number" ||
      !Number.isInteger(body.minQualityPct) ||
      body.minQualityPct < 0 ||
      body.minQualityPct > 100
    ) {
      return bad("bad_min_quality");
    }
  } else {
    if (!isStackableMarketplaceItem(body.kind, body.itemId)) {
      return bad("not_stackable");
    }
    if (
      body.kind === "material" &&
      !isTradableMarketplaceMaterial(body.itemId)
    ) {
      return bad("not_tradable");
    }
    if (!isValidMaterialQty(body.quantity)) return bad("bad_quantity");
  }
  const days = Number(body.days ?? 3);
  if (!Number.isInteger(days) || days < 1 || days > MARKETPLACE_V2_BUY_ORDER_MAX_DAYS) {
    return bad("bad_days");
  }
  const quantity = equipOrder ? 1 : (body.quantity as number);
  const escrowGold = quantity * body.unitPrice;
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
  const unitPrice = body.unitPrice;
  const minPower = equipOrder ? (body.minPower as number) : null;
  const minQualityPct = equipOrder ? (body.minQualityPct as number) : null;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const result = await db.transaction(async (tx) => {
    const matchScope = equipOrder
      ? null
      : await prepareMarketplaceMatchScope(tx, {
          kind,
          itemId,
          now,
          participantIds: [userId],
        });
    if (matchScope) requireMarketplaceMatchParticipants(matchScope, [userId]);
    else await requireTradeParticipants(tx, [userId], now);
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
        minPower,
        minQualityPct,
        status: "active",
        createdAt: now,
        expiresAt,
      })
      .returning({ id: marketplaceBuyOrdersV2.id });
    matchScope?.orderIds.add(order.id);
    const fills = equipOrder
      ? []
      : await matchMarketplaceBuyOrder(tx, order.id, now, matchScope!);
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
  }).catch((error) => {
    if (error instanceof TradeSuspendedError) return tradeSuspendedResponse(error);
    throw error;
  });
  if (result instanceof Response) return result;

  if (result.status === 200 && "fills" in result && result.body.ok) {
    recordEconomyEventSoon({
      userId,
      eventType: "marketplace.buy_order.escrow",
      goldDelta: -escrowGold,
      itemKind: kind,
      itemId,
      quantity,
      detail: {
        orderId: result.body.orderId,
        unitPrice,
        ...(equipOrder ? { minPower, minQualityPct } : {}),
      },
    });
    recordMarketplaceAutoMatchFills(result.fills ?? []);
    if (equipOrder) {
      recordAbuseEventSoon({
        userId,
        ip: clientIpFromRequest(req),
        action: "marketplace.equipment_buy_order.create",
        reason: "trade_audit",
        detail: {
          orderId: result.body.orderId,
          itemId,
          unitPrice,
          minPower,
          minQualityPct,
        },
      });
    }
  }
  return Response.json(result.body, { status: result.status });
}

export async function PATCH(req: Request) {
  const userId = await ensureUser();
  if (!userId) return bad("unauthorized", 401);
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:marketplace:buy-orders:update",
    userLimit: 30,
    ipLimit: 180,
    windowMs: 60_000,
  });
  if (limited) return limited;

  let body: {
    orderId?: unknown;
    quantity?: unknown;
    unitPrice?: unknown;
    days?: unknown;
    minPower?: unknown;
    minQualityPct?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return bad("invalid_json");
  }
  if (typeof body.orderId !== "number" || !Number.isInteger(body.orderId)) {
    return bad("bad_order");
  }
  if (!isValidMaterialQty(body.quantity)) return bad("bad_quantity");
  if (!isValidPrice(body.unitPrice)) return bad("bad_price");
  const days = Number(body.days);
  if (
    !Number.isInteger(days) ||
    days < 1 ||
    days > MARKETPLACE_V2_BUY_ORDER_MAX_DAYS
  ) {
    return bad("bad_days");
  }
  const requestedQuantity = body.quantity;
  const requestedUnitPrice = body.unitPrice;
  const now = new Date();

  const result = await db.transaction(async (tx) => {
    const [probe] = await tx
      .select({
        id: marketplaceBuyOrdersV2.id,
        buyerId: marketplaceBuyOrdersV2.buyerId,
        kind: marketplaceBuyOrdersV2.kind,
        itemId: marketplaceBuyOrdersV2.itemId,
      })
      .from(marketplaceBuyOrdersV2)
      .where(eq(marketplaceBuyOrdersV2.id, body.orderId as number))
      .limit(1);
    if (!probe) {
      await requireTradeParticipants(tx, [userId], now);
      return { status: 404, body: { ok: false as const, error: "not_found" } };
    }
    const matchScope =
      probe.kind === "equip"
        ? null
        : await prepareMarketplaceMatchScope(tx, {
            kind: probe.kind,
            itemId: probe.itemId,
            now,
            participantIds: [userId, probe.buyerId],
          });
    if (matchScope) requireMarketplaceMatchParticipants(matchScope, [userId]);
    else await requireTradeParticipants(tx, [userId], now);
    const [order] = await tx
      .select()
      .from(marketplaceBuyOrdersV2)
      .where(eq(marketplaceBuyOrdersV2.id, body.orderId as number))
      .for("update");
    if (!order) {
      return { status: 404, body: { ok: false as const, error: "not_found" } };
    }
    if (
      order.buyerId !== probe.buyerId ||
      order.kind !== probe.kind ||
      order.itemId !== probe.itemId
    ) {
      return { status: 409, body: { ok: false as const, error: "not_active" } };
    }
    if (order.buyerId !== userId) {
      return { status: 403, body: { ok: false as const, error: "not_owner" } };
    }
    if (order.status !== "active" || order.expiresAt <= now) {
      return { status: 409, body: { ok: false as const, error: "not_active" } };
    }
    // PATCH 대상은 비잠금 probe와 구매자 잠금을 이미 거쳤다. 일반 상위 50개 scope에서
    // 빠진 주문도 수정 직후의 기존 자동 매칭 의미를 보존하도록 명시 대상만 추가한다.
    matchScope?.orderIds.add(order.id);
    const equipOrder = order.kind === "equip";
    if (equipOrder && requestedQuantity !== 1) {
      return { status: 400, body: { ok: false as const, error: "bad_quantity" } };
    }
    let minPower = order.minPower;
    let minQualityPct = order.minQualityPct;
    if (equipOrder) {
      const minimumPrice = equipmentBuyOrderMinimumPrice(order.itemId);
      if (minimumPrice == null) {
        return { status: 400, body: { ok: false as const, error: "not_tradable" } };
      }
      if (requestedUnitPrice < minimumPrice) {
        return {
          status: 400,
          body: {
            ok: false as const,
            error: "price_below_floor",
            minimumPrice,
          },
        };
      }
      minPower =
        body.minPower == null ? order.minPower : Number(body.minPower);
      minQualityPct =
        body.minQualityPct == null
          ? order.minQualityPct
          : Number(body.minQualityPct);
      if (!Number.isInteger(minPower) || (minPower ?? 0) < 1) {
        return { status: 400, body: { ok: false as const, error: "bad_min_power" } };
      }
      if (
        !Number.isInteger(minQualityPct) ||
        (minQualityPct ?? -1) < 0 ||
        (minQualityPct ?? 101) > 100
      ) {
        return { status: 400, body: { ok: false as const, error: "bad_min_quality" } };
      }
    }
    const criteriaChanged =
      minPower !== order.minPower || minQualityPct !== order.minQualityPct;

    const edit = marketplaceBuyOrderEdit({
      quantityInitial: order.quantityInitial,
      quantityRemaining: order.quantityRemaining,
      goldEscrow: order.goldEscrow,
      unitPrice: order.unitPrice,
      requestedQuantity,
      requestedUnitPrice,
    });
    if (
      !Number.isSafeInteger(edit.goldEscrow) ||
      edit.goldEscrow < 1 ||
      edit.goldEscrow > MARKETPLACE_V2_BUY_ORDER_ESCROW_MAX
    ) {
      return { status: 400, body: { ok: false as const, error: "bad_price" } };
    }

    let nextGold: number | undefined;
    let nextBankedGold: number | undefined;
    if (edit.escrowDelta > 0) {
      const character = await lockSaveForUpdate<CharSave>(
        tx,
        userId,
        "character.v2",
        {},
      );
      const spend = spendGold(
        Math.max(0, Math.floor(character.gold ?? 0)),
        Math.max(0, Math.floor(character.bankedGold ?? 0)),
        edit.escrowDelta,
      );
      if (!spend.ok) {
        return {
          status: 400,
          body: { ok: false as const, error: "insufficient_gold" },
        };
      }
      nextGold = spend.gold;
      nextBankedGold = spend.bankedGold;
      await upsertSave(tx, userId, "character.v2", {
        ...character,
        gold: spend.gold,
        bankedGold: spend.bankedGold,
      });
    } else if (edit.escrowDelta < 0) {
      const refund = Math.abs(edit.escrowDelta);
      await tx.insert(marketplaceInbox).values(
        inboxValues({
          userId,
          payload: { kind: "buy_order_refund", gold: refund },
          message: `${order.itemName} 구매 주문 수정 · ${refund.toLocaleString()}골드 반환`,
        }),
      );
    }

    const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    await tx
      .update(marketplaceBuyOrdersV2)
      .set({
        unitPrice: requestedUnitPrice,
        quantityInitial: edit.quantityInitial,
        quantityRemaining: edit.quantityRemaining,
        goldEscrow: edit.goldEscrow,
        minPower,
        minQualityPct,
        expiresAt,
        ...(edit.resetsPriority || criteriaChanged ? { createdAt: now } : {}),
      })
      .where(eq(marketplaceBuyOrdersV2.id, order.id));
    const fills = equipOrder
      ? []
      : await matchMarketplaceBuyOrder(tx, order.id, now, matchScope!);
    return {
      status: 200,
      fills,
      escrowDelta: edit.escrowDelta,
      body: {
        ok: true as const,
        orderId: order.id,
        escrowDelta: edit.escrowDelta,
        ...(nextGold == null ? {} : { gold: nextGold }),
        ...(V2_CORE_LOOP_V2 && nextBankedGold != null
          ? { bankedGold: nextBankedGold }
          : {}),
      },
    };
  }).catch((error) => {
    if (error instanceof TradeSuspendedError) return tradeSuspendedResponse(error);
    throw error;
  });
  if (result instanceof Response) return result;

  if (result.status === 200 && "fills" in result && result.body.ok) {
    recordEconomyEventSoon({
      userId,
      eventType: "marketplace.buy_order.update",
      goldDelta: -Math.max(0, result.escrowDelta ?? 0),
      detail: {
        orderId: body.orderId,
        quantity: requestedQuantity,
        unitPrice: requestedUnitPrice,
        days,
        minPower: body.minPower,
        minQualityPct: body.minQualityPct,
        refundGold: Math.max(0, -(result.escrowDelta ?? 0)),
      },
    });
    recordMarketplaceAutoMatchFills(result.fills ?? []);
  }
  return Response.json(result.body, { status: result.status });
}
