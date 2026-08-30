import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import {
  isHuntStageDepth,
  latestUnlockedHuntStageDepth,
} from "@/adventure/data/v2/dungeon";
import {
  RARE_MAP_CAP,
  RARE_MAP_KINDS,
  genRareMapIid,
  newRareMapInstance,
  parseRareMaps,
} from "@/adventure/data/v2/rareMaps";
import {
  ENHANCE_EMBER_BLUE_COST,
  ENHANCE_EMBER_MATERIAL_ID,
  ENHANCE_EMBER_RED_COST,
  TORN_MAP_FRAGMENT_COMBINE_COST,
  TORN_MAP_FRAGMENT_MATERIAL_ID,
  isScavengedCraftRecipeId,
  rollCraftedRareMapKind,
  type ScavengedCraftRecipeId,
} from "@/adventure/data/v2/scavengedCrafting";
import { ENHANCE_STONE_MATERIAL_ID } from "@/adventure/data/v2/v2Enhance";
import { V2_CORE_LOOP_V2, spendGold } from "@/adventure/data/v2/coreLoopConfig";
import { COMBINE_GOLD_COST } from "@/adventure/data/v2/v2EquipVariance";
import {
  forgeCombinationTotal,
  parseForgeCombinationQuantity,
} from "@/adventure/data/v2/forgeCombination";
import {
  discountedPersonalCraftGoldCost,
  equippedPersonalCraftGoldDiscountPct,
} from "@/lib/server/equipmentLiberationCraftDiscount";

type CharSave = {
  materials?: Record<string, number>;
  rareMaps?: unknown;
  frontierDepth?: unknown;
  gold?: number;
  bankedGold?: number;
  [k: string]: unknown;
};

function recipeInput(recipe: ScavengedCraftRecipeId) {
  if (recipe === "blue_enhance_stone") {
    return {
      materialId: ENHANCE_EMBER_MATERIAL_ID,
      need: ENHANCE_EMBER_BLUE_COST,
    };
  }
  if (recipe === "red_enhance_stone") {
    return {
      materialId: ENHANCE_EMBER_MATERIAL_ID,
      need: ENHANCE_EMBER_RED_COST,
    };
  }
  return {
    materialId: TORN_MAP_FRAGMENT_MATERIAL_ID,
    need: TORN_MAP_FRAGMENT_COMBINE_COST,
  };
}

// POST /api/v2/me/scavenged-crafting — 수집형 글로벌 드롭을 강화석 또는 희귀 지도로 조합한다.
// 공통 조합비를 은행 우선으로 차감하며 재료 차감·산출물 지급과 함께 원자적으로 처리한다.
export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:me:scavenged-crafting",
    userLimit: 60,
    ipLimit: 360,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as {
    recipe?: unknown;
    depth?: unknown;
    quantity?: unknown;
  } | null;
  if (!isScavengedCraftRecipeId(body?.recipe)) {
    return Response.json({ ok: false, error: "invalid_recipe" }, { status: 400 });
  }
  const recipe = body.recipe;
  const input = recipeInput(recipe);
  const quantity = parseForgeCombinationQuantity(body.quantity);
  const materialCost =
    quantity == null ? null : forgeCombinationTotal(input.need, quantity);
  const baseGoldCost =
    quantity == null
      ? null
      : forgeCombinationTotal(COMBINE_GOLD_COST, quantity);
  if (quantity == null || materialCost == null || baseGoldCost == null) {
    return Response.json(
      { ok: false, error: "invalid_quantity" },
      { status: 400 },
    );
  }

  const result = await db.transaction(async (tx) => {
    const charSave = await lockSaveForUpdate<CharSave>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const materials = { ...(charSave.materials ?? {}) };
    const held = Math.max(
      0,
      Math.floor(Number(materials[input.materialId]) || 0),
    );
    if (held < materialCost) {
      return {
        status: 400,
        body: {
          ok: false as const,
          error: "insufficient_material" as const,
          need: materialCost,
        },
      };
    }

    const now = Date.now();
    const rareMaps = parseRareMaps(charSave.rareMaps, now);
    if (
      recipe === "rare_map" &&
      rareMaps.length + quantity > RARE_MAP_CAP
    ) {
      return {
        status: 400,
        body: {
          ok: false as const,
          error: "rare_map_full" as const,
          cap: RARE_MAP_CAP,
          available: Math.max(0, RARE_MAP_CAP - rareMaps.length),
        },
      };
    }

    const requestedMapDepth = body?.depth;
    const maxMapDepth = latestUnlockedHuntStageDepth(
      Math.floor(Number(charSave.frontierDepth) || 2),
    );
    if (
      recipe === "rare_map" &&
      (typeof requestedMapDepth !== "number" ||
        !isHuntStageDepth(requestedMapDepth) ||
        requestedMapDepth > maxMapDepth)
    ) {
      return {
        status: 400,
        body: {
          ok: false as const,
          error: "invalid_map_depth" as const,
          maxDepth: maxMapDepth,
        },
      };
    }

    const gold = Math.max(0, Math.floor(Number(charSave.gold) || 0));
    const bankedGold = Math.max(
      0,
      Math.floor(Number(charSave.bankedGold) || 0),
    );
    const equipment = await lockSaveForUpdate(
      tx,
      userId,
      "equipment.v2",
      {},
    );
    const liberationDiscountPct =
      equippedPersonalCraftGoldDiscountPct(equipment);
    const goldCost = discountedPersonalCraftGoldCost(
      baseGoldCost,
      liberationDiscountPct,
    );
    const spend = spendGold(gold, bankedGold, goldCost);
    if (!spend.ok) {
      return {
        status: 400,
        body: {
          ok: false as const,
          error: "insufficient_gold" as const,
          goldCost,
          baseGoldCost,
          liberationDiscountPct,
        },
      };
    }

    const materialLeft = held - materialCost;
    if (materialLeft > 0) materials[input.materialId] = materialLeft;
    else delete materials[input.materialId];

    if (recipe === "rare_map") {
      const depth = requestedMapDepth as number;
      const craftedRareMaps = Array.from({ length: quantity }, (_, index) => {
        const kind = rollCraftedRareMapKind(Math.random);
        return newRareMapInstance(
          kind,
          depth,
          now,
          `${genRareMapIid(Math.random)}_${index.toString(36)}`,
        );
      });
      const rareMap = craftedRareMaps[0];
      await upsertSave(tx, userId, "character.v2", {
        ...charSave,
        gold: spend.gold,
        bankedGold: spend.bankedGold,
        materials,
        rareMaps: [...rareMaps, ...craftedRareMaps],
      });
      return {
        status: 200,
        body: {
          ok: true as const,
          recipe,
          quantity,
          materialLeft,
          rareMap,
          rareMaps: craftedRareMaps,
          outputName: RARE_MAP_KINDS[rareMap.kind].name,
          goldCost,
          baseGoldCost,
          liberationDiscountPct,
          gold: spend.gold,
          ...(V2_CORE_LOOP_V2 ? { bankedGold: spend.bankedGold } : {}),
        },
      };
    }

    const stoneId =
      recipe === "blue_enhance_stone"
        ? ENHANCE_STONE_MATERIAL_ID.blue
        : ENHANCE_STONE_MATERIAL_ID.red;
    materials[stoneId] =
      Math.max(0, Math.floor(Number(materials[stoneId]) || 0)) + quantity;
    await upsertSave(tx, userId, "character.v2", {
      ...charSave,
      gold: spend.gold,
      bankedGold: spend.bankedGold,
      materials,
      rareMaps,
    });
    return {
      status: 200,
      body: {
        ok: true as const,
        recipe,
        quantity,
        materialLeft,
        outputMaterialId: stoneId,
        outputCount: materials[stoneId],
        goldCost,
        baseGoldCost,
        liberationDiscountPct,
        gold: spend.gold,
        ...(V2_CORE_LOOP_V2 ? { bankedGold: spend.bankedGold } : {}),
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
