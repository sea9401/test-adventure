import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { V2_MATERIALS, type V2MaterialId } from "@/adventure/data/v2/dungeonDrops";
import { MAX_CHARGE } from "@/app/api/v2/shop/charge/route";

// GET /api/v2/me/inventory — V2InventoryView + V2ShopView 자체 fetch.
//
// surface 필드:
//   - materials: v2 던전 드랍 (V2_MATERIALS 카탈로그 한정)
//   - hpCharges / mpCharges: 충전식 (1g=1, MAX_CHARGE cap). 옛 POTIONS 폐기.

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
  let invSave: { hpCharges?: number; mpCharges?: number } = {};
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

  // charges — 충전식 모델 (1g=1, MAX_CHARGE cap).
  const hpCharges = Math.max(0, Math.min(MAX_CHARGE, invSave.hpCharges ?? 0));
  const mpCharges = Math.max(0, Math.min(MAX_CHARGE, invSave.mpCharges ?? 0));

  return Response.json({ ok: true, materials, hpCharges, mpCharges });
}
