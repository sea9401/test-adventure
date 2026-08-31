import { db } from "@/db";
import {
  isGuildWorkshopRecipeId,
  parseGuildWorkshopFavoriteRecipeIds,
} from "@/adventure/data/v2/guildWorkshop";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";

const CRAFTING_SAVE_KEY = "crafting.v2";

export async function PATCH(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:guild-workshop:favorite",
    userLimit: 60,
    ipLimit: 300,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as {
    recipeId?: unknown;
  } | null;
  if (!isGuildWorkshopRecipeId(body?.recipeId)) {
    return Response.json(
      { ok: false, error: "invalid_recipe" },
      { status: 400 },
    );
  }
  const recipeId = body.recipeId;

  const favoriteRecipeIds = await db.transaction(async (tx) => {
    const current = await lockSaveForUpdate<Record<string, unknown>>(
      tx,
      userId,
      CRAFTING_SAVE_KEY,
      {},
    );
    const favorites = new Set(
      parseGuildWorkshopFavoriteRecipeIds(
        current.workshopFavoriteRecipeIds,
      ),
    );
    if (favorites.has(recipeId)) favorites.delete(recipeId);
    else favorites.add(recipeId);
    const nextFavoriteRecipeIds = [...favorites];
    const next = { ...current };
    if (nextFavoriteRecipeIds.length > 0) {
      next.workshopFavoriteRecipeIds = nextFavoriteRecipeIds;
    } else {
      delete next.workshopFavoriteRecipeIds;
    }
    await upsertSave(tx, userId, CRAFTING_SAVE_KEY, next);
    return nextFavoriteRecipeIds;
  });

  return Response.json({ ok: true, favoriteRecipeIds });
}
