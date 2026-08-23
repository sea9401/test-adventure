import type {
  CookingCombatFlatKey,
  CookingEffect,
  CookingEffectTag,
  CookingField,
  CookingRecipePublic,
} from "../types";
import type { V2StatKey } from "@/adventure/data/v2/v2StatKeys";

type Tier = CookingRecipePublic["tier"];

const PRIMARY_POWER = [0, 6, 10, 16, 24, 32] as const;
const COMBAT_POWER = [0, 50, 100, 160, 220, 300] as const;
const SURVIVAL_POWER = [0, 300, 700, 1_200, 2_000, 3_000] as const;
const REWARD_POWER = [0, 4, 7, 10, 12, 15] as const;

const SIGNATURE_STAT: Record<CookingField, V2StatKey> = {
  hearth: "str",
  pot: "vit",
  baking: "int",
  seafood: "dex",
  medicinal: "spi",
};

type ExtraChannel =
  | { kind: "primaryFlat"; key: "luk" }
  | { kind: "combatFlat"; key: CookingCombatFlatKey }
  | { kind: "reward"; key: "huntExpPct" | "huntGoldPct" | "cookingXpPct" };

const EXTRA_CHANNELS: readonly ExtraChannel[] = [
  { kind: "primaryFlat", key: "luk" },
  { kind: "combatFlat", key: "atk" },
  { kind: "combatFlat", key: "magicAtk" },
  { kind: "combatFlat", key: "def" },
  { kind: "combatFlat", key: "magicDef" },
  { kind: "combatFlat", key: "maxHp" },
  { kind: "combatFlat", key: "maxMp" },
  { kind: "combatFlat", key: "accuracy" },
  { kind: "reward", key: "huntExpPct" },
  { kind: "reward", key: "huntGoldPct" },
  { kind: "reward", key: "cookingXpPct" },
];

function positiveScaled(value: number, weight: number): number {
  return Math.max(1, Math.round(value * weight));
}

function extraValue(channel: ExtraChannel, tier: Tier, weight: number): number {
  if (channel.kind === "primaryFlat") {
    return positiveScaled(PRIMARY_POWER[tier], weight);
  }
  if (channel.kind === "reward") {
    return positiveScaled(REWARD_POWER[tier], weight);
  }
  if (channel.key === "maxHp") {
    return positiveScaled(SURVIVAL_POWER[tier], weight);
  }
  if (channel.key === "maxMp") {
    return positiveScaled(SURVIVAL_POWER[tier] / 3, weight);
  }
  return positiveScaled(COMBAT_POWER[tier], weight);
}

function addExtra(
  effect: CookingEffect,
  channel: ExtraChannel,
  tier: Tier,
  weight: number,
): CookingEffect {
  const value = extraValue(channel, tier, weight);
  if (channel.kind === "primaryFlat") {
    return {
      ...effect,
      primaryFlat: { ...effect.primaryFlat, [channel.key]: value },
    };
  }
  if (channel.kind === "combatFlat") {
    return {
      ...effect,
      combatFlat: { ...effect.combatFlat, [channel.key]: value },
    };
  }
  return { ...effect, [channel.key]: value };
}

function channelPair(occurrence: number): readonly [ExtraChannel, ExtraChannel] {
  if (!Number.isInteger(occurrence) || occurrence < 0) {
    throw new Error(`invalid_cooking_effect_occurrence:${occurrence}`);
  }
  let cursor = occurrence;
  for (let first = 0; first < EXTRA_CHANNELS.length - 1; first += 1) {
    const rowSize = EXTRA_CHANNELS.length - first - 1;
    if (cursor < rowSize) {
      return [EXTRA_CHANNELS[first], EXTRA_CHANNELS[first + cursor + 1]];
    }
    cursor -= rowSize;
  }
  throw new Error(`cooking_effect_profiles_exhausted:${occurrence}`);
}

function tagsFor(field: CookingField, effect: CookingEffect): readonly CookingEffectTag[] {
  const tags = new Set<CookingEffectTag>();
  if (field === "hearth" || field === "baking" || field === "seafood") tags.add("offense");
  if (field === "pot") tags.add("defense");
  if (field === "medicinal") tags.add("life");
  if (effect.combatFlat?.maxHp || effect.combatFlat?.maxMp) tags.add("recovery");
  if (effect.combatFlat?.def || effect.combatFlat?.magicDef) tags.add("defense");
  if (effect.huntExpPct) tags.add("hunt_exp");
  if (effect.huntGoldPct) tags.add("hunt_gold");
  if (effect.cookingXpPct) tags.add("life");
  return [...tags];
}

export function canonicalCookingEffect(effect: CookingEffect): string {
  const parts: string[] = [];
  for (const [group, values] of [
    ["primaryFlat", effect.primaryFlat],
    ["primaryPct", effect.primaryPct],
    ["combatFlat", effect.combatFlat],
  ] as const) {
    for (const [key, value] of Object.entries(values ?? {})) {
      if (value) parts.push(`${group}.${key}:${value}`);
    }
  }
  for (const key of ["huntExpPct", "huntGoldPct", "cookingXpPct"] as const) {
    if (effect[key]) parts.push(`${key}:${effect[key]}`);
  }
  return parts.sort().join("|");
}

export function effectForCookingExpansion(
  field: CookingField,
  tier: Tier,
  occurrence: number,
): { effect: CookingEffect; effectTags: readonly CookingEffectTag[] } {
  const [first, second] = channelPair(occurrence);
  let effect: CookingEffect = {
    primaryFlat: {
      [SIGNATURE_STAT[field]]: positiveScaled(PRIMARY_POWER[tier], 0.5),
    },
  };
  effect = addExtra(effect, first, tier, 0.3);
  effect = addExtra(effect, second, tier, 0.2);
  return { effect, effectTags: tagsFor(field, effect) };
}
