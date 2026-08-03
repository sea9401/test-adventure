import { and, count, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { marketplacePriceAlertsV2 } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import { lockSaveForUpdate } from "@/lib/server/savesKv";
import {
  isMarketKind,
  isStackableMarketplaceItem,
  isValidPrice,
  itemDisplayName,
} from "@/lib/server/marketplaceV2";

const ALERT_LIMIT = 20;

function bad(error: string, status = 400) {
  return Response.json({ ok: false, error }, { status });
}

export async function GET(req: Request) {
  const userId = await ensureUser();
  if (!userId) return bad("unauthorized", 401);
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:marketplace:price-alerts:get",
    userLimit: 120,
    ipLimit: 800,
    windowMs: 60_000,
  });
  if (limited) return limited;
  const alerts = await db
    .select()
    .from(marketplacePriceAlertsV2)
    .where(eq(marketplacePriceAlertsV2.userId, userId))
    .orderBy(desc(marketplacePriceAlertsV2.createdAt))
    .limit(50);
  return Response.json({ ok: true, alerts });
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) return bad("unauthorized", 401);
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:marketplace:price-alerts:write",
    userLimit: 30,
    ipLimit: 180,
    windowMs: 60_000,
  });
  if (limited) return limited;
  let body: {
    action?: unknown;
    alertId?: unknown;
    kind?: unknown;
    itemId?: unknown;
    targetUnitPrice?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return bad("invalid_json");
  }
  if (body.action === "cancel") {
    if (typeof body.alertId !== "number" || !Number.isInteger(body.alertId)) {
      return bad("bad_alert");
    }
    const [updated] = await db
      .update(marketplacePriceAlertsV2)
      .set({ status: "cancelled" })
      .where(
        and(
          eq(marketplacePriceAlertsV2.id, body.alertId),
          eq(marketplacePriceAlertsV2.userId, userId),
          eq(marketplacePriceAlertsV2.status, "active"),
        ),
      )
      .returning({ id: marketplacePriceAlertsV2.id });
    if (!updated) return bad("not_active", 409);
    return Response.json({ ok: true });
  }
  if (!isMarketKind(body.kind) || body.kind === "equip") return bad("bad_kind");
  if (typeof body.itemId !== "string") return bad("bad_item");
  if (!isStackableMarketplaceItem(body.kind, body.itemId)) {
    return bad("not_stackable");
  }
  if (!isValidPrice(body.targetUnitPrice)) return bad("bad_price");
  const itemName = itemDisplayName(body.kind, body.itemId);
  if (!itemName) return bad("not_tradable");
  const kind = body.kind;
  const itemId = body.itemId;
  const targetUnitPrice = body.targetUnitPrice;

  const result = await db.transaction(async (tx) => {
    await lockSaveForUpdate(tx, userId, "character.v2", {});
    const [existing] = await tx
      .select({ id: marketplacePriceAlertsV2.id })
      .from(marketplacePriceAlertsV2)
      .where(
        and(
          eq(marketplacePriceAlertsV2.userId, userId),
          eq(marketplacePriceAlertsV2.kind, kind),
          eq(marketplacePriceAlertsV2.itemId, itemId),
          eq(marketplacePriceAlertsV2.status, "active"),
        ),
      )
      .limit(1);
    if (existing) {
      await tx
        .update(marketplacePriceAlertsV2)
        .set({ targetUnitPrice })
        .where(eq(marketplacePriceAlertsV2.id, existing.id));
      return { id: existing.id, updated: true };
    }
    const [{ value: activeCount }] = await tx
      .select({ value: count() })
      .from(marketplacePriceAlertsV2)
      .where(
        and(
          eq(marketplacePriceAlertsV2.userId, userId),
          eq(marketplacePriceAlertsV2.status, "active"),
        ),
      );
    if (activeCount >= ALERT_LIMIT) return null;
    const [created] = await tx
      .insert(marketplacePriceAlertsV2)
      .values({
        userId,
        kind,
        itemId,
        itemName,
        targetUnitPrice,
      })
      .returning({ id: marketplacePriceAlertsV2.id });
    return { id: created.id, updated: false };
  });
  if (!result) return bad("alert_limit");
  return Response.json({ ok: true, ...result });
}
