import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import type { db } from "@/db";
import { marketplaceInbox, museunCoinLedger } from "@/db/schema";
import { inboxValues } from "./inboxPayload";
import { restoreMuseunCoinSpend } from "./museunCoinAccount";
import {
  priceCutNoticeText,
  SHOP_PRICE_CUT_LEDGER_KIND,
  type PriceCutCompensationRuntime,
  type PriceCutGrant,
  type PriceCutPurchase,
} from "./museunCoinPriceCutCompensation";

function purchaseQuantity(detail: unknown): number {
  const quantity =
    detail && typeof detail === "object"
      ? (detail as Record<string, unknown>).quantity
      : null;
  return typeof quantity === "number" && Number.isSafeInteger(quantity) && quantity > 0
    ? quantity
    : 1;
}

export function createPriceCutCompensationRuntime(
  database: typeof db,
): PriceCutCompensationRuntime {
  return {
    async listPurchases(itemIds) {
      const rows = await database
        .select()
        .from(museunCoinLedger)
        .where(
          and(
            eq(museunCoinLedger.kind, "shop_purchase"),
            inArray(museunCoinLedger.sourceId, [...itemIds]),
            isNotNull(museunCoinLedger.userId),
          ),
        )
        .orderBy(asc(museunCoinLedger.id));
      if (rows.length === 0) return [];
      const restored = await database
        .select({ eventKey: museunCoinLedger.eventKey })
        .from(museunCoinLedger)
        .where(
          inArray(
            museunCoinLedger.eventKey,
            rows.map((row) => `spend_restore:${row.id}`),
          ),
        );
      const restoredKeys = new Set(restored.map((row) => row.eventKey));
      return rows.flatMap((row): PriceCutPurchase[] =>
        row.userId && row.sourceId
          ? [
              {
                ledgerId: row.id,
                userId: row.userId,
                itemId: row.sourceId,
                spentCoins: -(row.freeDelta + row.paidDelta),
                quantity: purchaseQuantity(row.detail),
                compensated: restoredKeys.has(`spend_restore:${row.id}`),
              },
            ]
          : [],
      );
    },

    async compensateUser(userId, grants) {
      return database.transaction(async (tx) => {
        const applied: PriceCutGrant[] = [];
        let freeRestored = 0;
        let paidRestored = 0;
        for (const grant of grants) {
          const result = await restoreMuseunCoinSpend(tx, {
            userId,
            spendLedgerId: grant.ledgerId,
            coins: grant.coins,
            kind: SHOP_PRICE_CUT_LEDGER_KIND,
            sourceId: grant.itemId,
            detail: { quantity: grant.quantity },
          });
          if (result.duplicate) continue;
          applied.push(grant);
          freeRestored += result.freeRestored;
          paidRestored += result.paidRestored;
        }
        if (applied.length > 0) {
          await tx.insert(marketplaceInbox).values(
            inboxValues({
              userId,
              payload: { kind: "user_message", text: priceCutNoticeText(applied) },
              fromName: "운영자",
            }),
          );
        }
        return { applied: applied.length, freeRestored, paidRestored };
      });
    },
  };
}
