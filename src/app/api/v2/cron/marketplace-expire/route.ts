import { and, eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { marketplaceListingsV2 } from "@/db/schema";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  genEquipIid,
  parseEquipmentSave,
  type V2EquipmentId,
  type V2EquipRoll,
} from "@/adventure/data/v2/v2Equipment";
import { MARKETPLACE_V2_LISTING_TTL_DAYS } from "@/lib/server/marketplaceV2";

// POST /api/v2/cron/marketplace-expire — 만료 매물 sweep (cron 주기 호출, 예: 매시간). CRON_SECRET.
//   등록 후 TTL(MARKETPLACE_V2_LISTING_TTL_DAYS) 지난 active 매물을 판매자에게 반환(장비=새 개체,
//   재료=수량 복원, cancel 라우트와 동형) + status='expired'. 반환은 판매자 save 직접 기록(오프라인 OK).
//   per-listing tx + listing FOR UPDATE 재확인 → 동시 구매와 직렬화(막 팔린 건 skip, 아이템 중복/소실 0).
//   잠금 순서 listing → 판매자 save (buy/cancel 과 일관 = 데드락 회피).

type CharSave = { materials?: Record<string, number>; [k: string]: unknown };
const BATCH = 200; // 1회 처리 상한(폭주/장기 tx 방지 — 다음 cron 이 나머지 처리).

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - MARKETPLACE_V2_LISTING_TTL_DAYS * 24 * 60 * 60 * 1000);

  // 1) 만료 후보 id(active + createdAt < cutoff). read-only — 본 처리는 per-listing tx 에서 재확인.
  const due = await db
    .select({ id: marketplaceListingsV2.id })
    .from(marketplaceListingsV2)
    .where(
      and(
        eq(marketplaceListingsV2.status, "active"),
        lt(marketplaceListingsV2.createdAt, cutoff),
      ),
    )
    .limit(BATCH);

  let expired = 0;
  for (const { id } of due) {
    const ok = await db.transaction(async (tx) => {
      const [l] = await tx
        .select()
        .from(marketplaceListingsV2)
        .where(eq(marketplaceListingsV2.id, id))
        .for("update");
      // 막 팔림/취소/이미 만료 → skip (동시 구매와 직렬화).
      if (!l || l.status !== "active" || l.createdAt >= cutoff) return false;

      if (l.kind === "equip") {
        const equipSave = await lockSaveForUpdate<Record<string, unknown>>(
          tx,
          l.sellerId,
          "equipment.v2",
          {},
        );
        const { owned, equipped } = parseEquipmentSave(equipSave);
        const roll = (l.instancePayload as V2EquipRoll | null) ?? undefined;
        await upsertSave(tx, l.sellerId, "equipment.v2", {
          owned: [...owned, { iid: genEquipIid(), id: l.itemId as V2EquipmentId, roll }],
          equipped,
        });
      } else {
        const charSave = await lockSaveForUpdate<CharSave>(tx, l.sellerId, "character.v2", {});
        const mats = { ...(charSave.materials ?? {}) };
        mats[l.itemId] = Math.max(0, Math.floor(mats[l.itemId] ?? 0)) + l.quantity;
        await upsertSave(tx, l.sellerId, "character.v2", { ...charSave, materials: mats });
      }

      await tx
        .update(marketplaceListingsV2)
        .set({ status: "expired", closedAt: new Date() })
        .where(eq(marketplaceListingsV2.id, id));
      return true;
    });
    if (ok) expired++;
  }

  return Response.json({ ok: true, scanned: due.length, expired });
}
