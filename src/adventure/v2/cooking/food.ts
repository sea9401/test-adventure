import "server-only";

import { COOKING_PUBLIC_RECIPE_BY_ID } from "./catalog";
import {
  COOKING_BUFF_DURATION_MS,
  COOKING_QUALITY_DELIVERY,
  cookingPerformancePct,
  parseCookingFoodIdFormat,
  scaleCookingEffect,
  type ActiveCookingBuff,
  type CookingFoodDefinition,
  type CookingFoodId,
  type CookingFoodInventory,
  type CookingFoodVariant,
  type CookingQuality,
} from "./foodShared";

export * from "./foodShared";

function boundedInt(raw: unknown, cap: number): number {
  return Math.min(cap, Math.max(0, Math.round(Number(raw) || 0)));
}

export function parseCookingFoodId(raw: unknown): CookingFoodVariant | null {
  const variant = parseCookingFoodIdFormat(raw);
  return variant && COOKING_PUBLIC_RECIPE_BY_ID.has(variant.recipeId) ? variant : null;
}

export function isCookingFoodId(raw: unknown): raw is CookingFoodId {
  return parseCookingFoodId(raw) !== null;
}

export function cookingFoodDefinition(raw: unknown): CookingFoodDefinition | null {
  const variant = parseCookingFoodId(raw);
  if (!variant) return null;
  const recipe = COOKING_PUBLIC_RECIPE_BY_ID.get(variant.recipeId)!;
  const tags = [
    variant.quality === "masterpiece" ? "걸작" : variant.quality === "careful" ? "정성작" : "일반",
    variant.originator ? "원조" : "",
    variant.specialtyBonusPct > 0 ? `전문 +${variant.specialtyBonusPct}%` : "",
  ].filter(Boolean);
  return {
    ...variant,
    recipe,
    name: `${recipe.name} (${tags.join(" · ")})`,
    performancePct: cookingPerformancePct(variant),
    deliveryScorePct: COOKING_QUALITY_DELIVERY[variant.quality],
    durationMs: COOKING_BUFF_DURATION_MS,
    effect: scaleCookingEffect(recipe.effect, variant),
  };
}

export function cookingFoodDefinitions(raw: unknown): Partial<Record<CookingFoodId, CookingFoodDefinition>> {
  const inventory = parseCookingFoodInventory(raw);
  return Object.fromEntries(Object.keys(inventory).flatMap((id) => {
    const definition = cookingFoodDefinition(id);
    return definition ? [[id, definition]] : [];
  }));
}

export function parseCookingFoodInventory(raw: unknown): CookingFoodInventory {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const entries = Object.entries(raw).flatMap(([id, count]) => {
    if (!isCookingFoodId(id)) return [];
    const parsed = boundedInt(count, 999_999);
    return parsed > 0 ? [[id, parsed]] : [];
  });
  return Object.fromEntries(entries) as CookingFoodInventory;
}

export function addCookingFood(raw: unknown, id: CookingFoodId, count: number): CookingFoodInventory {
  const inventory = parseCookingFoodInventory(raw);
  const amount = boundedInt(count, 999_999);
  if (amount < 1) return inventory;
  return { ...inventory, [id]: (inventory[id] ?? 0) + amount };
}

export function removeCookingFood(raw: unknown, id: CookingFoodId, count: number): CookingFoodInventory | null {
  const inventory = parseCookingFoodInventory(raw);
  const amount = boundedInt(count, 999_999);
  const held = inventory[id] ?? 0;
  if (amount < 1 || held < amount) return null;
  const next = { ...inventory };
  if (held === amount) delete next[id];
  else next[id] = held - amount;
  return next;
}

export function activeCookingBuff(raw: unknown, now = Date.now()): ActiveCookingBuff | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<ActiveCookingBuff>;
  const recipe = typeof value.recipeId === "string" ? COOKING_PUBLIC_RECIPE_BY_ID.get(value.recipeId) : null;
  if (!recipe || !Number.isFinite(value.expiresAt) || Number(value.expiresAt) <= now) return null;
  const quality: CookingQuality = value.quality === "masterpiece" || value.quality === "careful" ? value.quality : "normal";
  const source = value.effect && typeof value.effect === "object" ? value.effect : {};
  return {
    recipeId: recipe.id,
    recipeName: recipe.name,
    quality,
    effect: scaleCookingEffect(source, { quality: "normal", originator: false, specialtyBonusPct: 0 }),
    expiresAt: Number(value.expiresAt),
  };
}
