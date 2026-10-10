// 생활 축제 주문 품목의 보유량 조회·차감. 종류마다 보관 세이브가 다르다.
//   processed → character.v2.materials        aid  → life-workshop.v1.crafting.balances
//   ranch     → farm.v2.inventory             dish → inventory.v2.cookingFoods
// 차감은 해당 키만 바꾸고 세이브의 나머지 필드는 그대로 둔다(파싱·정규화로 다른 값이 바뀌지 않게).

import "server-only";

import type {
  LifeFestivalDishRequirement,
  LifeFestivalRequirement,
} from "@/adventure/data/v2/lifeFestival";
import { cookingFoodDefinition } from "@/adventure/v2/cooking/food";
import { FARM_SAVE_KEY } from "@/adventure/v2/farm";
import {
  dishMatchesRequirement,
  validateDishSelection,
  type LifeFestivalDishFacts,
} from "@/adventure/v2/lifeFestival";
import { LIFE_WORKSHOP_SAVE_KEY } from "@/adventure/v2/lifeWorkshop";
import {
  lockSaveForUpdate,
  upsertSave,
  type DbExecutor,
} from "@/lib/server/savesKv";

export type SaveRecord = Record<string, unknown>;

export type LifeFestivalItemSaves = {
  character: SaveRecord;
  workshop: SaveRecord;
  farm: SaveRecord;
  inventory: SaveRecord;
};

export const LIFE_FESTIVAL_ITEM_SAVE_KEYS = {
  character: "character.v2",
  workshop: LIFE_WORKSHOP_SAVE_KEY,
  farm: FARM_SAVE_KEY,
  inventory: "inventory.v2",
} as const;

function record(value: unknown): SaveRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as SaveRecord)
    : {};
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

type Location = {
  saveKey: keyof LifeFestivalItemSaves;
  read: (save: SaveRecord) => SaveRecord;
  write: (save: SaveRecord, bucket: SaveRecord) => SaveRecord;
};

function locationFor(kind: LifeFestivalRequirement["kind"]): Location {
  switch (kind) {
    case "processed":
      return {
        saveKey: "character",
        read: (save) => record(save.materials),
        write: (save, materials) => ({ ...save, materials }),
      };
    case "aid":
      return {
        saveKey: "workshop",
        read: (save) => record(record(save.crafting).balances),
        write: (save, balances) => ({
          ...save,
          crafting: { ...record(save.crafting), balances },
        }),
      };
    case "ranch":
      return {
        saveKey: "farm",
        read: (save) => record(save.inventory),
        write: (save, inventory) => ({ ...save, inventory }),
      };
    case "dish":
      return {
        saveKey: "inventory",
        read: (save) => record(save.cookingFoods),
        write: (save, cookingFoods) => ({ ...save, cookingFoods }),
      };
  }
}

export function lifeFestivalDishFacts(foodId: string): LifeFestivalDishFacts | null {
  const definition = cookingFoodDefinition(foodId);
  return definition
    ? {
        tier: definition.recipe.tier,
        effectTags: definition.recipe.effectTags,
        quality: definition.quality,
      }
    : null;
}

export type LifeFestivalDishOption = {
  foodId: string;
  name: string;
  tier: number;
  quality: "normal" | "careful" | "masterpiece" | "signature";
  count: number;
};

const QUALITY_ORDER = { normal: 0, careful: 1, masterpiece: 2, signature: 3 } as const;

export function lifeFestivalDishOptions(
  inventorySave: SaveRecord,
  requirement: LifeFestivalDishRequirement,
): LifeFestivalDishOption[] {
  const foods = record(inventorySave.cookingFoods);
  const options: LifeFestivalDishOption[] = [];
  for (const [foodId, raw] of Object.entries(foods)) {
    const held = count(raw);
    if (held <= 0) continue;
    const definition = cookingFoodDefinition(foodId);
    if (!definition) continue;
    const facts = {
      tier: definition.recipe.tier,
      effectTags: definition.recipe.effectTags,
      quality: definition.quality,
    };
    if (!dishMatchesRequirement(facts, requirement)) continue;
    options.push({
      foodId,
      name: definition.name,
      tier: facts.tier,
      quality: facts.quality,
      count: held,
    });
  }
  return options.sort(
    (a, b) =>
      QUALITY_ORDER[a.quality] - QUALITY_ORDER[b.quality] ||
      a.tier - b.tier ||
      a.name.localeCompare(b.name, "ko"),
  );
}

export function heldLifeFestivalItems(
  saves: LifeFestivalItemSaves,
  requirement: LifeFestivalRequirement,
): number {
  if (requirement.kind === "dish") {
    return lifeFestivalDishOptions(saves.inventory, requirement).reduce(
      (sum, option) => sum + option.count,
      0,
    );
  }
  const location = locationFor(requirement.kind);
  return count(location.read(saves[location.saveKey])[requirement.itemId]);
}

function subtract(bucket: SaveRecord, itemId: string, amount: number): SaveRecord {
  const next = { ...bucket };
  const remaining = count(next[itemId]) - amount;
  if (remaining > 0) next[itemId] = remaining;
  else delete next[itemId];
  return next;
}

export async function consumeLifeFestivalRequirement(
  tx: DbExecutor,
  userId: string,
  requirement: LifeFestivalRequirement,
  times: number,
  foodIds?: Record<string, number>,
): Promise<{ ok: true } | { ok: false; error: "not_enough_items" | "invalid_food_selection" }> {
  const location = locationFor(requirement.kind);
  const key = LIFE_FESTIVAL_ITEM_SAVE_KEYS[location.saveKey];
  const save = record(await lockSaveForUpdate(tx, userId, key, {}));
  const bucket = location.read(save);
  let next = bucket;

  if (requirement.kind === "dish") {
    const selection = foodIds ?? {};
    if (
      validateDishSelection(selection, bucket as Partial<Record<string, number>>, requirement, times, lifeFestivalDishFacts).ok === false
    ) {
      const held = lifeFestivalDishOptions(save, requirement).reduce(
        (sum, option) => sum + option.count,
        0,
      );
      return {
        ok: false,
        error: held < requirement.quantity * times ? "not_enough_items" : "invalid_food_selection",
      };
    }
    for (const [foodId, amount] of Object.entries(selection)) {
      next = subtract(next, foodId, amount);
    }
  } else {
    const needed = requirement.quantity * times;
    if (count(bucket[requirement.itemId]) < needed) {
      return { ok: false, error: "not_enough_items" };
    }
    next = subtract(next, requirement.itemId, needed);
  }

  await upsertSave(tx, userId, key, location.write(save, next));
  return { ok: true };
}
