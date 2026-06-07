import { eq } from "drizzle-orm";
import { db } from "@/db";
import { marketplaceListingsV2 } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  genEquipIid,
  parseEquipmentSave,
  type V2EquipmentId,
  type V2EquipRoll,
} from "@/adventure/data/v2/v2Equipment";

// POST /api/v2/marketplace/cancel — 내 활성 매물 취소(에스크로 반환).
//   body: { listingId:int }
// listing FOR UPDATE → 본인·활성 확인 → 아이템을 판매자 save 로 반환(장비=새 개체, 재료=수량 복원)
//   → cancelled 마킹. (판매자 본인이 온라인이라 직접 save 반환 — 우편 불필요.)

type CharSave = {
  materials?: Record<string, number>;
  [k: string]: unknown;
};

function bad(error: string, status = 400) {
  return Response.json({ ok: false, error }, { status });
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) return bad("unauthorized", 401);

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

    if (listing.kind === "equip") {
      const equipSave = await lockSaveForUpdate<Record<string, unknown>>(
        tx,
        userId,
        "equipment.v2",
        {},
      );
      const { owned, equipped } = parseEquipmentSave(equipSave);
      const roll = (listing.instancePayload as V2EquipRoll | null) ?? undefined;
      const nextOwned = [
        ...owned,
        { iid: genEquipIid(), id: listing.itemId as V2EquipmentId, roll },
      ];
      await upsertSave(tx, userId, "equipment.v2", { owned: nextOwned, equipped });
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

    return { status: 200, body: { ok: true as const } };
  });

  return Response.json(result.body, { status: result.status });
}
