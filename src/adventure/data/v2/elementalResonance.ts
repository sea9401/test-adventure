import {
  V2_SKILLS,
  spCostOf,
  type V2SkillDefinition,
  type V2SkillId,
} from "./v2Skills";

const ELEMENTAL_SURGE_ID = "v2c_elementallord_surge" satisfies V2SkillId;
const ELEMENTAL_RESONANCE_ID = "v2c_elementallord_resonance" satisfies V2SkillId;
const PRIMORDIAL_RETURN_ID = "v2c_primordialmage_return" satisfies V2SkillId;
const PRIMORDIAL_RESONANCE_ID = "v2c_primordialmage_resonance" satisfies V2SkillId;

const ELEMENTAL_MATERIAL_IDS = new Set<V2SkillId>([
  "v2c_firemage_inferno",
  "v2c_frostmage_glacier",
  "v2c_lightningmage_thunderbolt",
  "v2c_windmage_tempest",
  "v2c_earthmage_tectonic",
]);

export type V2CastVariant = NonNullable<V2SkillDefinition["castVariants"]>[number];
export type ElementalResonanceCircuit = "none" | "elemental" | "primordial";

export type ElementalResonanceLoadout = {
  circuit: ElementalResonanceCircuit;
  castVariant: V2CastVariant | undefined;
  absorbedSkillIds: V2SkillId[];
  catalystActive: boolean;
  effectiveSpCosts: ReadonlyMap<V2SkillId, number>;
  spUsed: number;
  activeCombatSkillIds: V2SkillId[];
};

export function selectV2CastVariant(
  definition: V2SkillDefinition,
  learned: ReadonlySet<V2SkillId> | readonly V2SkillId[],
  equipped: ReadonlySet<V2SkillId> | readonly V2SkillId[],
): V2CastVariant | undefined {
  const learnedSet = learned instanceof Set ? learned : new Set(learned);
  const equippedSet = equipped instanceof Set ? equipped : new Set(equipped);
  return definition.castVariants?.find(
    (variant) =>
      (variant.requiredLearnedSkillIds ?? []).every((id) => learnedSet.has(id)) &&
      (variant.requiredEquippedSkillIds ?? []).every((id) => equippedSet.has(id)),
  );
}

export function resolveElementalResonanceLoadout({
  learned,
  equipped,
}: {
  learned: readonly V2SkillId[];
  equipped: readonly V2SkillId[];
}): ElementalResonanceLoadout {
  const learnedSet = new Set(learned);
  const equippedSet = new Set(equipped);
  const primordialActive =
    equippedSet.has(PRIMORDIAL_RETURN_ID) && equippedSet.has(PRIMORDIAL_RESONANCE_ID);
  const elementalActive =
    equippedSet.has(ELEMENTAL_SURGE_ID) && equippedSet.has(ELEMENTAL_RESONANCE_ID);
  const circuit: ElementalResonanceCircuit = primordialActive
    ? "primordial"
    : elementalActive
      ? "elemental"
      : "none";
  const signatureId =
    circuit === "primordial"
      ? PRIMORDIAL_RETURN_ID
      : circuit === "elemental"
        ? ELEMENTAL_SURGE_ID
        : undefined;
  const castVariant = signatureId
    ? selectV2CastVariant(V2_SKILLS[signatureId], learnedSet, equippedSet)
    : undefined;
  const absorbedSkillIds = (castVariant?.requiredEquippedSkillIds ?? []).filter((id) =>
    ELEMENTAL_MATERIAL_IDS.has(id),
  );
  const catalystActive = circuit === "primordial" && equippedSet.has(ELEMENTAL_SURGE_ID);
  if (catalystActive) absorbedSkillIds.push(ELEMENTAL_SURGE_ID);

  const absorbedSet = new Set(absorbedSkillIds);
  const effectiveSpCosts = new Map<V2SkillId, number>();
  let spUsed = 0;
  for (const id of equipped) {
    const skill = V2_SKILLS[id];
    if (!skill) continue;
    const cost = absorbedSet.has(id) ? 2 : spCostOf(skill);
    effectiveSpCosts.set(id, cost);
    spUsed += cost;
  }

  return {
    circuit,
    castVariant,
    absorbedSkillIds,
    catalystActive,
    effectiveSpCosts,
    spUsed,
    activeCombatSkillIds: equipped.filter((id) => !absorbedSet.has(id)),
  };
}
