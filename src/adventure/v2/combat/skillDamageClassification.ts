import { type V2SkillDefinition, type V2SkillEffect } from "@/adventure/data/v2/v2Skills";

export function v2SkillHasDirectMagicDamage(
  def: V2SkillDefinition,
): boolean {
  const hasMagicDamage = (effects: readonly V2SkillEffect[]) =>
    effects.some(
      (effect) =>
        effect.kind === "damage" &&
        (effect.scaling === "magic" || effect.scaling === "spi"),
    );
  return (
    hasMagicDamage(def.effects) ||
    Object.values(def.elementEffects ?? {}).some(
      (effects) => effects != null && hasMagicDamage(effects),
    ) ||
    (def.castVariants ?? []).some((variant) =>
      hasMagicDamage(variant.effects),
    )
  );
}
