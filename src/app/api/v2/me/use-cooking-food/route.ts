import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import {
  cookingFoodDefinition,
  removeCookingFood,
  type ActiveCookingBuff,
} from "@/adventure/v2/cooking/food";

type CharacterSave = Record<string, unknown> & {
  activeFoodBuff?: ActiveCookingBuff;
};
type InventorySave = Record<string, unknown> & { cookingFoods?: unknown };

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:me:use-cooking-food",
    userLimit: 30,
    ipLimit: 180,
    windowMs: 60_000,
  });
  if (limited) return limited;
  const body = (await req.json().catch(() => null)) as { itemId?: unknown } | null;
  const food = cookingFoodDefinition(body?.itemId);
  if (!food) return Response.json({ ok: false, error: "bad_item" }, { status: 400 });

  const now = Date.now();
  const result = await db.transaction(async (tx) => {
    const character = await lockSaveForUpdate<CharacterSave>(tx, userId, "character.v2", {});
    const inventory = await lockSaveForUpdate<InventorySave>(tx, userId, "inventory.v2", {});
    const cookingFoods = removeCookingFood(inventory.cookingFoods, food.id, 1);
    if (!cookingFoods) return { ok: false as const, error: "not_owned" };
    const activeBuff: ActiveCookingBuff = {
      recipeId: food.recipeId,
      recipeName: food.recipe.name,
      quality: food.quality,
      effect: food.effect,
      // 같은 음식도 누적하지 않는다. 어떤 음식이든 사용 시점부터 정확히 12시간으로 교체한다.
      expiresAt: now + food.durationMs,
    };
    await upsertSave(tx, userId, "character.v2", { ...character, activeFoodBuff: activeBuff });
    await upsertSave(tx, userId, "inventory.v2", { ...inventory, cookingFoods });
    return { ok: true as const, activeBuff, cookingFoods };
  });
  if (!result.ok) return Response.json(result, { status: 409 });
  return Response.json(result);
}
