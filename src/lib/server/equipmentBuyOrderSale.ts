import { and, asc, desc, eq, gt, gte, inArray, lte, ne } from "drizzle-orm";
import { db } from "@/db";
import { marketplaceBuyOrdersV2, marketplaceInbox } from "@/db/schema";
import type { V2EquipInstance } from "@/adventure/data/v2/v2Equipment";
import { equipmentOrderSnapshot } from "@/adventure/v2/marketplace/equipmentBuyOrders";
import {
  equipmentBuyOrderMinimumPrice,
  saleProceeds,
} from "@/lib/server/marketplaceV2";
import { inboxValues } from "@/lib/server/inboxPayload";
import { recordEconomyEventSoon } from "@/lib/server/economyLog";
import { recordAbuseEventSoon } from "@/lib/server/abuseLog";
import {
  TradeSuspendedError,
  lockTradeParticipantStatuses,
} from "@/lib/server/tradeSuspension";
import type { ActiveTradeRestriction } from "@/lib/tradeSuspension";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type EquipmentBuyOrderSaleAudit = {
  iid: string;
  orderId: number;
  buyerId: string;
  itemId: string;
  itemName: string;
  price: number;
  proceeds: number;
  taxRate: number;
  minimumPrice: number;
  power: number;
  qualityPct: number;
};

export type EquipmentBuyOrderSaleScope = {
  participantIds: Set<string>;
  participantStatuses: Map<string, ActiveTradeRestriction | null>;
  orderIds: Set<number>;
};

function equipmentPayload(instance: V2EquipInstance) {
  return instance.roll ||
    instance.enhance ||
    instance.craftQuality ||
    instance.craftedBy ||
    instance.stormRefined
    ? {
        ...(instance.roll ?? {}),
        ...(instance.enhance ? { enhance: instance.enhance } : {}),
        ...(instance.craftQuality
          ? { craftQuality: instance.craftQuality }
          : {}),
        ...(instance.craftedBy ? { craftedBy: instance.craftedBy } : {}),
        ...(instance.stormRefined ? { stormRefined: true } : {}),
      }
    : null;
}

export async function prepareEquipmentBuyOrderSaleScope(
  tx: Tx,
  args: {
    sellerId: string;
    instances: readonly V2EquipInstance[];
    now: Date;
  },
): Promise<EquipmentBuyOrderSaleScope> {
  const orders: Array<{ id: number; buyerId: string }> = [];
  const seenOrderIds = new Set<number>();
  for (const instance of args.instances) {
    if (instance.bound) continue;
    const snapshot = equipmentOrderSnapshot(instance);
    const minimumPrice = equipmentBuyOrderMinimumPrice(instance.id);
    if (!snapshot || minimumPrice == null) continue;
    const candidates = await tx
      .select({
        id: marketplaceBuyOrdersV2.id,
        buyerId: marketplaceBuyOrdersV2.buyerId,
      })
      .from(marketplaceBuyOrdersV2)
      .where(
        and(
          eq(marketplaceBuyOrdersV2.kind, "equip"),
          eq(marketplaceBuyOrdersV2.itemId, instance.id),
          eq(marketplaceBuyOrdersV2.status, "active"),
          ne(marketplaceBuyOrdersV2.buyerId, args.sellerId),
          gt(marketplaceBuyOrdersV2.expiresAt, args.now),
          gte(marketplaceBuyOrdersV2.unitPrice, minimumPrice),
          lte(marketplaceBuyOrdersV2.minPower, snapshot.power),
          lte(marketplaceBuyOrdersV2.minQualityPct, snapshot.qualityPct),
        ),
      )
      .orderBy(
        desc(marketplaceBuyOrdersV2.unitPrice),
        asc(marketplaceBuyOrdersV2.createdAt),
        asc(marketplaceBuyOrdersV2.id),
      )
      .limit(50);
    for (const order of candidates) {
      if (seenOrderIds.has(order.id)) continue;
      seenOrderIds.add(order.id);
      orders.push(order);
    }
  }
  const participantIds = new Set([
    args.sellerId,
    ...orders.map((order) => order.buyerId),
  ]);
  return {
    participantIds,
    participantStatuses: await lockTradeParticipantStatuses(
      tx,
      [...participantIds],
      args.now,
    ),
    orderIds: seenOrderIds,
  };
}

export function requireEquipmentBuyOrderSaleParticipants(
  scope: EquipmentBuyOrderSaleScope,
  userIds: readonly string[],
) {
  for (const userId of userIds) {
    const restriction = scope.participantStatuses.get(userId);
    if (restriction) throw new TradeSuspendedError(restriction);
  }
}

/** 주문 ID를 입력받지 않고 조건을 만족하는 최고가→시간 우선 주문 하나를 잠가 체결한다. */
export async function fillBestEquipmentBuyOrder(
  tx: Tx,
  args: {
    sellerId: string;
    instance: V2EquipInstance;
    taxRate: number;
    now: Date;
    preparedScope?: EquipmentBuyOrderSaleScope;
  },
): Promise<EquipmentBuyOrderSaleAudit | null> {
  const { sellerId, instance, taxRate, now } = args;
  if (instance.bound) return null;
  const snapshot = equipmentOrderSnapshot(instance);
  const minimumPrice = equipmentBuyOrderMinimumPrice(instance.id);
  if (!snapshot || minimumPrice == null) return null;
  const scope =
    args.preparedScope ??
    (await prepareEquipmentBuyOrderSaleScope(tx, {
      sellerId,
      instances: [instance],
      now,
    }));
  if (
    !scope.participantIds.has(sellerId) ||
    scope.participantStatuses.get(sellerId) ||
    scope.orderIds.size === 0
  ) {
    return null;
  }

  const orders = await tx
    .select()
    .from(marketplaceBuyOrdersV2)
    .where(
      and(
        eq(marketplaceBuyOrdersV2.kind, "equip"),
        eq(marketplaceBuyOrdersV2.itemId, instance.id),
        inArray(marketplaceBuyOrdersV2.id, [...scope.orderIds]),
        eq(marketplaceBuyOrdersV2.status, "active"),
        ne(marketplaceBuyOrdersV2.buyerId, sellerId),
        gt(marketplaceBuyOrdersV2.expiresAt, now),
        gte(marketplaceBuyOrdersV2.unitPrice, minimumPrice),
        lte(marketplaceBuyOrdersV2.minPower, snapshot.power),
        lte(marketplaceBuyOrdersV2.minQualityPct, snapshot.qualityPct),
      ),
    )
    .orderBy(
      asc(marketplaceBuyOrdersV2.id),
    )
    .for("update");
  orders.sort(
    (left, right) =>
      right.unitPrice - left.unitPrice ||
      left.createdAt.getTime() - right.createdAt.getTime() ||
      left.id - right.id,
  );
  const order = orders.find(
    (candidate) =>
      scope.orderIds.has(candidate.id) &&
      scope.participantIds.has(candidate.buyerId) &&
      !scope.participantStatuses.get(candidate.buyerId),
  );
  if (!order) return null;
  if (order.goldEscrow < order.unitPrice) {
    throw new Error(`equipment_buy_order_escrow_corrupt:${order.id}`);
  }

  await tx.insert(marketplaceInbox).values(
    inboxValues({
      userId: order.buyerId,
      payload: {
        kind: "buy_order_equipment",
        order_id: order.id,
        item_id: instance.id,
        instance_payload: equipmentPayload(instance),
      },
      message: `${order.itemName} 장비 구매 주문 체결`,
    }),
  );
  const proceeds = saleProceeds(order.unitPrice, taxRate);
  if (proceeds > 0) {
    await tx.insert(marketplaceInbox).values(
      inboxValues({
        userId: sellerId,
        payload: { kind: "sale_proceeds", gold: proceeds },
        message: `${order.itemName} 구매 주문 판매 대금 ${proceeds.toLocaleString()}골드`,
      }),
    );
  }
  const refund = order.goldEscrow - order.unitPrice;
  if (refund > 0) {
    await tx.insert(marketplaceInbox).values(
      inboxValues({
        userId: order.buyerId,
        payload: { kind: "buy_order_refund", gold: refund },
        message: `${order.itemName} 장비 구매 주문 잔여금 ${refund.toLocaleString()}골드 반환`,
      }),
    );
  }
  await tx
    .update(marketplaceBuyOrdersV2)
    .set({
      quantityRemaining: 0,
      goldEscrow: 0,
      status: "filled",
      closedAt: now,
    })
    .where(eq(marketplaceBuyOrdersV2.id, order.id));

  return {
    iid: instance.iid,
    orderId: order.id,
    buyerId: order.buyerId,
    itemId: instance.id,
    itemName: order.itemName,
    price: order.unitPrice,
    proceeds,
    taxRate,
    minimumPrice,
    power: snapshot.power,
    qualityPct: snapshot.qualityPct,
  };
}

export function recordEquipmentBuyOrderSale(
  audit: EquipmentBuyOrderSaleAudit,
  args: { sellerId: string; ip: string | null; batchId?: string },
) {
  const { sellerId, ip, batchId } = args;
  recordEconomyEventSoon({
    userId: audit.buyerId,
    counterpartyUserId: sellerId,
    eventType: "marketplace.equipment_buy_order.fill",
    goldDelta: 0,
    itemKind: "equip",
    itemId: audit.itemId,
    quantity: 1,
    detail: {
      orderId: audit.orderId,
      escrowGoldUsed: audit.price,
      minimumPrice: audit.minimumPrice,
      power: audit.power,
      qualityPct: audit.qualityPct,
      ...(batchId ? { batchId } : {}),
    },
  });
  recordEconomyEventSoon({
    userId: sellerId,
    counterpartyUserId: audit.buyerId,
    eventType: "marketplace.equipment_buy_order.sell",
    goldDelta: audit.proceeds,
    itemKind: "equip",
    itemId: audit.itemId,
    quantity: 1,
    detail: {
      orderId: audit.orderId,
      grossGold: audit.price,
      taxRate: audit.taxRate,
      minimumPrice: audit.minimumPrice,
      power: audit.power,
      qualityPct: audit.qualityPct,
      ...(batchId ? { batchId } : {}),
    },
  });
  recordAbuseEventSoon({
    userId: sellerId,
    ip,
    action: "marketplace.equipment_buy_order.fill",
    reason: "trade_audit",
    detail: {
      orderId: audit.orderId,
      buyerId: audit.buyerId,
      itemId: audit.itemId,
      grossGold: audit.price,
      minimumPrice: audit.minimumPrice,
      ...(batchId ? { batchId } : {}),
    },
  });
}
