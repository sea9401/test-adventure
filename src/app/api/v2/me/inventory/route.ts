import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { V2_MATERIALS, type V2MaterialId } from "@/adventure/data/v2/dungeonDrops";

// GET /api/v2/me/inventory — V2InventoryView 의 자체 fetch.
//
// 현재는 v2 materials (던전 사냥 placeholder 드랍) 만. 미래 장비/스킬북 등이
// 추가되면 같은 endpoint 에 필드 누적.

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const charRow = (
    await db
      .select({ value: savesKv.value })
      .from(savesKv)
      .where(and(eq(savesKv.userId, userId), eq(savesKv.key, "character.v2")))
      .limit(1)
  )[0];
  const charSave = (charRow?.value ?? {}) as {
    materials?: Record<string, unknown>;
  };

  // V2_MATERIALS catalog 의 키만 surface. 다른 키(라이브 시스템 또는 향후 분리될 시스템)는
  // 무시 — V2InventoryView 가 다루는 게 v2_ 재료 한정.
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

  return Response.json({ ok: true, materials });
}
