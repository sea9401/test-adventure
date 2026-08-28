import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { V2_MATERIALS, type V2MaterialId } from "@/adventure/data/v2/dungeonDrops";
import { MAX_CHARGE } from "@/lib/v2-charge-config";
import {
  parseSpFruitUsed,
  spCapBonusFromRaw,
} from "@/adventure/data/v2/spFruit";
import {
  V2_REFORGE_ENABLED,
  isReforgeStoneMaterialId,
} from "@/adventure/data/v2/v2EquipVariance";
import { cookingFoodDefinitions, parseCookingFoodInventory } from "@/adventure/v2/cooking/food";
import { MASTERY_CERTIFICATE_KEY } from "@/adventure/data/v2/masteryTower";
import { FARM_SAVE_KEY } from "@/adventure/v2/farm";
import { FISHING_STOCK_KEY } from "@/adventure/v2/fishingStock";
import { COOKING_SAVE_KEY } from "@/adventure/v2/cooking/state";
import { marketplaceLifeItemHoldings } from "@/lib/server/marketplaceLifeInventory";

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
        inArray(savesKv.key, [
          "character.v2",
          "inventory.v2",
          FARM_SAVE_KEY,
          FISHING_STOCK_KEY,
          COOKING_SAVE_KEY,
        ]),
      ),
    );

  let charSave: { materials?: Record<string, unknown>; spFruitUsed?: unknown } =
    {};
  let invSave: {
    hpCharges?: number;
    mpCharges?: number;
    cookingFoods?: unknown;
    [MASTERY_CERTIFICATE_KEY]?: unknown;
  } = {};
  let farmRaw: unknown;
  let fishingRaw: unknown;
  let cookingRaw: unknown;
  for (const r of rows) {
    if (r.key === "character.v2")
      charSave = (r.value ?? {}) as typeof charSave;
    else if (r.key === "inventory.v2")
      invSave = (r.value ?? {}) as typeof invSave;
    else if (r.key === FARM_SAVE_KEY) farmRaw = r.value;
    else if (r.key === FISHING_STOCK_KEY) fishingRaw = r.value;
    else if (r.key === COOKING_SAVE_KEY) cookingRaw = r.value;
  }

  // materials — V2_MATERIALS catalog 키만 surface.
  const rawMaterials =
    charSave.materials && typeof charSave.materials === "object"
      ? charSave.materials
      : {};
  const materials: Partial<Record<V2MaterialId, number>> = {};
  for (const id of Object.keys(V2_MATERIALS) as V2MaterialId[]) {
    if (!V2_REFORGE_ENABLED && isReforgeStoneMaterialId(id)) continue;
    const v = rawMaterials[id];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) {
      materials[id] = Math.floor(v);
    }
  }

  // charges — 충전식 모델 (1g=1, MAX_CHARGE cap).
  const hpCharges = Math.max(0, Math.min(MAX_CHARGE, invSave.hpCharges ?? 0));
  const mpCharges = Math.max(0, Math.min(MAX_CHARGE, invSave.mpCharges ?? 0));

  // SP 열매 사용 현황 — 소모품 탭이 등급별 "사용 N/캡"·캡 도달 차단을 그린다.
  const spFruitUsed = parseSpFruitUsed(charSave.spFruitUsed);
  const spCapBonus = spCapBonusFromRaw(charSave.spFruitUsed);
  const masteryCertificates = Math.max(
    0,
    Math.floor(Number(invSave[MASTERY_CERTIFICATE_KEY]) || 0),
  );
  const marketplaceMaterials = {
    ...materials,
    ...marketplaceLifeItemHoldings({ farmRaw, fishingRaw, cookingRaw }),
  };

  return Response.json({
    ok: true,
    materials,
    marketplaceMaterials,
    masteryCertificates,
    hpCharges,
    mpCharges,
    cookingFoods: parseCookingFoodInventory(invSave.cookingFoods),
    cookingFoodDefinitions: cookingFoodDefinitions(invSave.cookingFoods),
    spFruitUsed,
    spCapBonus,
  });
}
