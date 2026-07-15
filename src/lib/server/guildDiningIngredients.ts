import {
  FARM_ITEMS,
  FARM_SAVE_KEY,
  emptyFarmState,
  parseFarmState,
  type FarmItemId,
  type FarmState,
} from "@/adventure/v2/farm";
import {
  GUILD_DINING_INGREDIENTS,
  type GuildDiningIngredient,
  type GuildDiningIngredientSource,
} from "@/adventure/data/v2/guildDining";
import {
  lockSaveForUpdate,
  readSave,
  upsertSave,
  type DbExecutor,
} from "./savesKv";

type SourceReader = {
  readBalances(
    tx: DbExecutor,
    userId: string,
    ingredients: readonly GuildDiningIngredient[],
    now: Date,
  ): Promise<Record<string, number>>;
  lockIngredient(
    tx: DbExecutor,
    userId: string,
    ingredient: GuildDiningIngredient,
    now: Date,
  ): Promise<{
    owned: number;
    consume(quantity: number): Promise<void>;
  } | null>;
};

function isFarmItemId(value: string): value is FarmItemId {
  return Object.prototype.hasOwnProperty.call(FARM_ITEMS, value);
}

const farmSource: SourceReader = {
  async readBalances(tx, userId, ingredients, now) {
    const farm = parseFarmState(
      await readSave(tx, userId, FARM_SAVE_KEY, emptyFarmState(now.getTime())),
    );
    return Object.fromEntries(
      ingredients.map((ingredient) => [
        ingredient.id,
        isFarmItemId(ingredient.sourceItemId)
          ? farm.inventory[ingredient.sourceItemId] ?? 0
          : 0,
      ]),
    );
  },

  async lockIngredient(tx, userId, ingredient, now) {
    if (!isFarmItemId(ingredient.sourceItemId)) return null;
    const farm = parseFarmState(
      await lockSaveForUpdate(
        tx,
        userId,
        FARM_SAVE_KEY,
        emptyFarmState(now.getTime()),
      ),
    );
    const itemId = ingredient.sourceItemId;
    return {
      owned: farm.inventory[itemId] ?? 0,
      async consume(quantity) {
        const nextFarm: FarmState = { ...farm, inventory: { ...farm.inventory } };
        const remaining = (nextFarm.inventory[itemId] ?? 0) - quantity;
        if (remaining > 0) nextFarm.inventory[itemId] = remaining;
        else delete nextFarm.inventory[itemId];
        await upsertSave(tx, userId, FARM_SAVE_KEY, nextFarm);
      },
    };
  },
};

// 물고기 아이템화 시 fishing_item 구현을 이 표에 추가한다. 라우트·화면·메뉴 규칙은
// 공급원의 실제 세이브 키나 인벤토리 모양을 전혀 알 필요가 없다.
const SOURCE_READERS: Partial<Record<GuildDiningIngredientSource, SourceReader>> = {
  farm: farmSource,
};

export async function readGuildDiningIngredientBalances(
  tx: DbExecutor,
  userId: string,
  now: Date = new Date(),
): Promise<Record<string, number>> {
  const bySource = new Map<GuildDiningIngredientSource, GuildDiningIngredient[]>();
  for (const ingredient of GUILD_DINING_INGREDIENTS) {
    const group = bySource.get(ingredient.source) ?? [];
    group.push(ingredient);
    bySource.set(ingredient.source, group);
  }
  const entries = await Promise.all(
    [...bySource.entries()].map(async ([source, ingredients]) => {
      const reader = SOURCE_READERS[source];
      return reader
        ? reader.readBalances(tx, userId, ingredients, now)
        : Object.fromEntries(ingredients.map((ingredient) => [ingredient.id, 0]));
    }),
  );
  return Object.assign({}, ...entries) as Record<string, number>;
}

export async function lockGuildDiningIngredient(
  tx: DbExecutor,
  userId: string,
  ingredient: GuildDiningIngredient,
  now: Date = new Date(),
) {
  return SOURCE_READERS[ingredient.source]?.lockIngredient(
    tx,
    userId,
    ingredient,
    now,
  ) ?? null;
}
