import { eq } from "drizzle-orm";
import { db } from "@/db";
import { marketplaceListingsV2 } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import { recordEconomyEventSoon } from "@/lib/server/economyLog";
import { parseRareMaps } from "@/adventure/data/v2/rareMaps";
import { restoreMarketplaceRareMap } from "@/lib/server/marketplaceV2";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { appendEquipInstances } from "@/lib/server/equipGrant";
import { type V2EquipmentId } from "@/adventure/data/v2/v2Equipment";
import { mintListedEquipInstance } from "@/adventure/data/v2/v2EquipMint";
import {
  addMuseunCashItem,
  isMuseunCashItemId,
} from "@/adventure/data/v2/museunCashItems";
import {
  addCookingFood,
  isCookingFoodId,
} from "@/adventure/v2/cooking";
import {
  deliverFishSpecimenStack,
} from "@/lib/server/marketplaceV2Fulfillment";

// POST /api/v2/marketplace/cancel — 내 활성 매물 취소(에스크로 반환).
//   body: { listingId:int }
// listing FOR UPDATE → 본인·활성 확인 → 아이템을 판매자 save 로 반환(장비=새 개체, 재료=수량 복원)
//   → cancelled 마킹. (판매자 본인이 온라인이라 직접 save 반환 — 우편 불필요.)

type CharSave = {
  rareMaps?: unknown;
  cashItems?: unknown;
  materials?: Record<string, number>;
  [k: string]: unknown;
};

type InventorySave = Record<string, unknown> & {
  cookingFoods?: unknown;
};

function bad(error: string, status = 400) {
  return Response.json({ ok: false, error }, { status });
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) return bad("unauthorized", 401);
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:marketplace:cancel",
    userLimit: 60,
    ipLimit: 360,
    windowMs: 60_000,
  });
  if (limited) return limited;

  let body: { listingId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return bad("invalid_json");
  }
  if (typeof body.listingId !== "number" || !Number.isInteger(body.listingId)) {
    return bad("bad_listingId");
  }
  const listingId = body.listingId;

  const result = await db.transaction(async (tx) => {
    const [listing] = await tx
      .select()
      .from(marketplaceListingsV2)
      .where(eq(marketplaceListingsV2.id, listingId))
      .for("update");
    if (!listing) return { status: 404, body: { ok: false as const, error: "not_found" } };
    if (listing.sellerId !== userId) {
      return { status: 403, body: { ok: false as const, error: "not_owner" } };
    }
    if (listing.status !== "active") {
      return { status: 409, body: { ok: false as const, error: "not_active" } };
    }
    if (listing.bidCount > 0) {
      return { status: 409, body: { ok: false as const, error: "has_bids" } };
    }

    if (listing.kind === "equip") {
      // payload = 굴림(+강화+제작품질) — 옛 행은 raw roll. 방어 파스는 mintListedEquipInstance 공용.
      await appendEquipInstances(tx, userId, [
        mintListedEquipInstance(
          listing.itemId as V2EquipmentId,
          listing.instancePayload,
        ),
      ]);
    } else if (listing.kind === "consumable") {
      const charSave = await lockSaveForUpdate<CharSave>(tx, userId, "character.v2", {});
      if (
        await deliverFishSpecimenStack(
          tx,
          userId,
          listing.itemId,
          listing.quantity,
        )
      ) {
        // 표본 스택 반환 완료.
      } else if (isMuseunCashItemId(listing.itemId)) {
        await upsertSave(tx, userId, "character.v2", {
          ...charSave,
          cashItems: addMuseunCashItem(
            charSave.cashItems,
            listing.itemId,
            listing.quantity,
          ),
        });
      } else if (isCookingFoodId(listing.itemId)) {
        const inventory = await lockSaveForUpdate<InventorySave>(
          tx,
          userId,
          "inventory.v2",
          {},
        );
        await upsertSave(tx, userId, "inventory.v2", {
          ...inventory,
          cookingFoods: addCookingFood(
            inventory.cookingFoods,
            listing.itemId,
            listing.quantity,
          ),
        });
      } else {
        const inst = restoreMarketplaceRareMap(
          listing.instancePayload,
          Date.now(),
          { preserveIid: true },
        );
        if (inst) {
          await upsertSave(tx, userId, "character.v2", {
            ...charSave,
            rareMaps: [...parseRareMaps(charSave.rareMaps, Date.now()), inst],
          });
        }
      }
    } else {
      const charSave = await lockSaveForUpdate<CharSave>(tx, userId, "character.v2", {});
      const mats = { ...(charSave.materials ?? {}) };
      mats[listing.itemId] = Math.max(0, Math.floor(mats[listing.itemId] ?? 0)) + listing.quantity;
      await upsertSave(tx, userId, "character.v2", { ...charSave, materials: mats });
    }

    await tx
      .update(marketplaceListingsV2)
      .set({ status: "cancelled", closedAt: new Date() })
      .where(eq(marketplaceListingsV2.id, listingId));

    return {
      status: 200,
      log: {
        itemKind: listing.kind,
        itemId: listing.itemId,
        quantity: listing.quantity,
        price: listing.price,
        listingId,
      },
      body: { ok: true as const },
    };
  });

  const economyLog = result.status === 200 && "log" in result ? result.log : null;
  if (economyLog) {
    recordEconomyEventSoon({
      userId,
      eventType: "marketplace.cancel",
      goldDelta: 0,
      itemKind: economyLog.itemKind,
      itemId: economyLog.itemId,
      quantity: economyLog.quantity,
      detail: {
        listingId: economyLog.listingId,
        price: economyLog.price,
      },
    });
  }

  return Response.json(result.body, { status: result.status });
}
