import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import { MAX_FRONTIER_DEPTH } from "@/adventure/data/v2/dungeon";
import {
  RARE_MAP_CAP,
  RARE_MAP_KINDS,
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

type CharSave = {
  materials?: Record<string, number>;
  rareMaps?: unknown;
  frontierDepth?: unknown;
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
// 조합비는 없으며 character.v2 단일 락에서 재료 차감과 산출물 지급을 원자적으로 처리한다.
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
  } | null;
  if (!isScavengedCraftRecipeId(body?.recipe)) {
    return Response.json({ ok: false, error: "invalid_recipe" }, { status: 400 });
  }
  const recipe = body.recipe;
  const input = recipeInput(recipe);

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
    if (held < input.need) {
      return {
        status: 400,
        body: {
          ok: false as const,
          error: "insufficient_material" as const,
          need: input.need,
        },
      };
    }

    const now = Date.now();
    const rareMaps = parseRareMaps(charSave.rareMaps, now);
    if (recipe === "rare_map" && rareMaps.length >= RARE_MAP_CAP) {
      return {
        status: 400,
        body: {
          ok: false as const,
          error: "rare_map_full" as const,
          cap: RARE_MAP_CAP,
        },
      };
    }

    const materialLeft = held - input.need;
    if (materialLeft > 0) materials[input.materialId] = materialLeft;
    else delete materials[input.materialId];

    if (recipe === "rare_map") {
      const kind = rollCraftedRareMapKind(Math.random);
      const depth = Math.min(
        MAX_FRONTIER_DEPTH,
        Math.max(2, Math.floor(Number(charSave.frontierDepth) || 2)),
      );
      const rareMap = newRareMapInstance(kind, depth, now);
      await upsertSave(tx, userId, "character.v2", {
        ...charSave,
        materials,
        rareMaps: [...rareMaps, rareMap],
      });
      return {
        status: 200,
        body: {
          ok: true as const,
          recipe,
          materialLeft,
          rareMap,
          outputName: RARE_MAP_KINDS[kind].name,
        },
      };
    }

    const stoneId =
      recipe === "blue_enhance_stone"
        ? ENHANCE_STONE_MATERIAL_ID.blue
        : ENHANCE_STONE_MATERIAL_ID.red;
    materials[stoneId] =
      Math.max(0, Math.floor(Number(materials[stoneId]) || 0)) + 1;
    await upsertSave(tx, userId, "character.v2", {
      ...charSave,
      materials,
      rareMaps,
    });
    return {
      status: 200,
      body: {
        ok: true as const,
        recipe,
        materialLeft,
        outputMaterialId: stoneId,
        outputCount: materials[stoneId],
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
