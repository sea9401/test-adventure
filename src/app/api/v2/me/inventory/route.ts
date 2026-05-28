import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { V2_MATERIALS, type V2MaterialId } from "@/adventure/data/v2/dungeonDrops";
import { POTION_IDS, type PotionId } from "@/adventure/data/potions";

// GET /api/v2/me/inventory — V2InventoryView + V2ShopView 자체 fetch.
//
// surface 필드:
//   - materials: v2 던전 드랍 (V2_MATERIALS 카탈로그 한정)
//   - potions: inventory.v2.potions raw (POTION_IDS 카탈로그 한정) — 상점 구매 후 누적.

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select({ key: savesKv.key, value: savesKv.value })
    .from(savesKv)
    .where(
      and(
        eq(savesKv.userId, userId),
        inArray(savesKv.key, ["character.v2", "inventory.v2"]),
      ),
    );

  let charSave: { materials?: Record<string, unknown> } = {};
  let invSave: { potions?: Record<string, unknown> } = {};
  for (const r of rows) {
    if (r.key === "character.v2")
      charSave = (r.value ?? {}) as typeof charSave;
    else if (r.key === "inventory.v2")
      invSave = (r.value ?? {}) as typeof invSave;
  }

  // materials — V2_MATERIALS catalog 키만 surface.
  const rawMaterials =
    charSave.materials && typeof charSave.materials === "object"
      ? charSave.materials
      : {};
  const materials: Partial<Record<V2MaterialId, number>> = {};
  for (const id of Object.keys(V2_MATERIALS) as V2MaterialId[]) {
    const v = rawMaterials[id];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) {
      materials[id] = Math.floor(v);
    }
  }

  // potions — POTION_IDS catalog 키만 surface.
  const rawPotions =
    invSave.potions && typeof invSave.potions === "object"
      ? invSave.potions
      : {};
  const potions: Partial<Record<PotionId, number>> = {};
  for (const id of POTION_IDS) {
    const v = rawPotions[id];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) {
      potions[id] = Math.floor(v);
    }
  }

  return Response.json({ ok: true, materials, potions });
}
