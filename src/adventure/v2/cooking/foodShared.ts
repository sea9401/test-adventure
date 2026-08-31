import { V2_STAT_KEYS, type V2StatKey } from "@/adventure/data/v2/v2StatKeys";
import type { CookingCombatFlatKey, CookingEffect, CookingRecipePublic } from "./types";

export const COOKING_BUFF_DURATION_MS = 12 * 60 * 60 * 1_000;
export type CookingQuality = "normal" | "careful" | "masterpiece";
export type CookingFoodId = `food2:${string}:${CookingQuality}:o${0 | 1}:s${0 | 1 | 2 | 3 | 4 | 5}`;
export type CookingFoodInventory = Partial<Record<CookingFoodId, number>>;
export type CookingFoodVariant = { id: CookingFoodId; recipeId: string; quality: CookingQuality; originator: boolean; specialtyBonusPct: 0 | 1 | 2 | 3 | 4 | 5 };
export type CookingFoodDefinition = CookingFoodVariant & { recipe: CookingRecipePublic; name: string; performancePct: number; deliveryScorePct: 100 | 125 | 160; durationMs: number; effect: CookingEffect };
export type CookingFoodDefinitionMap = Partial<Record<CookingFoodId, CookingFoodDefinition>>;
export type ActiveCookingBuff = { recipeId: string; recipeName: string; quality: CookingQuality; effect: CookingEffect; expiresAt: number };

export function cookingQualityName(quality: CookingQuality): string {
  if (quality === "masterpiece") return "걸작";
  if (quality === "careful") return "정성작";
  return "일반";
}

const QUALITY_PERFORMANCE: Record<CookingQuality, number> = { normal: 0, careful: 10, masterpiece: 20 };
export const COOKING_QUALITY_DELIVERY: Record<CookingQuality, 100 | 125 | 160> = { normal: 100, careful: 125, masterpiece: 160 };
const COMBAT_CAPS: Record<CookingCombatFlatKey, number> = { atk: 300, magicAtk: 300, def: 300, magicDef: 300, maxHp: 3_000, maxMp: 1_000, accuracy: 300 };

function boundedInt(raw: unknown, cap: number): number { return Math.min(cap, Math.max(0, Math.round(Number(raw) || 0))); }
function boundedDecimal(raw: unknown, cap: number): number { return Math.min(cap, Math.max(0, Math.round((Number(raw) || 0) * 10) / 10)); }
function scaledRecord<K extends string>(source: Partial<Record<K, number>> | undefined, multiplier: number, capFor: (key: K) => number, decimal: boolean): Partial<Record<K, number>> | undefined {
  if (!source) return undefined;
  const entries = Object.entries(source).flatMap(([key, raw]) => {
    const value = decimal ? boundedDecimal(Number(raw) * multiplier, capFor(key as K)) : boundedInt(Number(raw) * multiplier, capFor(key as K));
    return value > 0 ? [[key, value]] : [];
  });
  return entries.length > 0 ? Object.fromEntries(entries) as Partial<Record<K, number>> : undefined;
}

export function cookingPerformancePct(args: { quality: CookingQuality; originator: boolean; specialtyBonusPct: number }): number {
  return Math.min(135, 100 + QUALITY_PERFORMANCE[args.quality] + (args.originator ? 10 : 0) + Math.min(5, Math.max(0, Math.floor(args.specialtyBonusPct))));
}

export function scaleCookingEffect(effect: CookingEffect, args: { quality: CookingQuality; originator: boolean; specialtyBonusPct: number }): CookingEffect {
  const multiplier = cookingPerformancePct(args) / 100;
  const primaryFlat = scaledRecord<V2StatKey>(effect.primaryFlat, multiplier, () => 40, false);
  const primaryPct = scaledRecord<V2StatKey>(effect.primaryPct, multiplier, () => 5, true);
  const combatFlat = scaledRecord<CookingCombatFlatKey>(effect.combatFlat, multiplier, (key) => COMBAT_CAPS[key], false);
  const huntExpPct = boundedDecimal((effect.huntExpPct ?? 0) * multiplier, 15);
  const huntGoldPct = boundedDecimal((effect.huntGoldPct ?? 0) * multiplier, 15);
  const cookingXpPct = boundedDecimal((effect.cookingXpPct ?? 0) * multiplier, 15);
  return { ...(primaryFlat ? { primaryFlat } : {}), ...(primaryPct ? { primaryPct } : {}), ...(combatFlat ? { combatFlat } : {}), ...(huntExpPct > 0 ? { huntExpPct } : {}), ...(huntGoldPct > 0 ? { huntGoldPct } : {}), ...(cookingXpPct > 0 ? { cookingXpPct } : {}) };
}

export function cookingFoodId(args: { recipeId: string; quality: CookingQuality; originator: boolean; specialtyBonusPct: number }): CookingFoodId {
  const specialty = Math.min(5, Math.max(0, Math.floor(args.specialtyBonusPct))) as 0 | 1 | 2 | 3 | 4 | 5;
  return `food2:${args.recipeId}:${args.quality}:o${args.originator ? 1 : 0}:s${specialty}`;
}

export function parseCookingFoodIdFormat(raw: unknown): CookingFoodVariant | null {
  if (typeof raw !== "string") return null;
  const [prefix, recipeId, qualityRaw, originRaw, specialtyRaw, extra] = raw.split(":");
  if (prefix !== "food2" || !recipeId || extra !== undefined) return null;
  const quality: CookingQuality | null = qualityRaw === "normal" || qualityRaw === "careful" || qualityRaw === "masterpiece" ? qualityRaw : null;
  if (!quality || (originRaw !== "o0" && originRaw !== "o1") || !/^s[0-5]$/.test(specialtyRaw)) return null;
  return { id: raw as CookingFoodId, recipeId, quality, originator: originRaw === "o1", specialtyBonusPct: Number(specialtyRaw.slice(1)) as 0 | 1 | 2 | 3 | 4 | 5 };
}

export function isCookingFoodIdFormat(raw: unknown): raw is CookingFoodId { return parseCookingFoodIdFormat(raw) !== null; }

export function cookingEffectText(effect: CookingEffect): string {
  const parts: string[] = [];
  for (const stat of V2_STAT_KEYS) {
    if (effect.primaryFlat?.[stat]) parts.push(`${stat.toUpperCase()} +${effect.primaryFlat[stat]}`);
    if (effect.primaryPct?.[stat]) parts.push(`${stat.toUpperCase()} +${effect.primaryPct[stat]}%`);
  }
  const labels: Record<CookingCombatFlatKey, string> = { atk: "공격력", magicAtk: "마법공격력", def: "방어력", magicDef: "마법방어력", maxHp: "최대 HP", maxMp: "최대 MP", accuracy: "적중" };
  for (const [key, value] of Object.entries(effect.combatFlat ?? {})) if (value) parts.push(`${labels[key as CookingCombatFlatKey]} +${value}`);
  if (effect.huntExpPct) parts.push(`사냥 경험치 +${effect.huntExpPct}%`);
  if (effect.huntGoldPct) parts.push(`사냥 골드 +${effect.huntGoldPct}%`);
  if (effect.cookingXpPct) parts.push(`요리 경험치 +${effect.cookingXpPct}%`);
  return parts.join(" · ");
}
