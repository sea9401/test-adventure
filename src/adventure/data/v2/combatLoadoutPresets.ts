import {
  V2_EQUIPMENT,
  type V2EquipInstance,
  type V2EquipSlot,
} from "./v2Equipment";
import type { V2SkillId } from "./v2Skills";
import {
  parseCombatPattern,
  type V2CombatPattern,
} from "@/adventure/v2/combat/combatPattern";

export const COMBAT_LOADOUT_PRESET_SLOTS = 5;
export const COMBAT_LOADOUT_PRESET_NAME_MAX = 24;

export const COMBAT_LOADOUT_EQUIPMENT_SLOTS: readonly V2EquipSlot[] = [
  "weapon",
  "armor",
  "gloves",
  "boots",
  "ring",
  "necklace",
];

export type CombatLoadoutPreset = {
  name: string;
  savedAt: string;
  skills: V2SkillId[];
  pattern: V2CombatPattern | null;
  equipment: Partial<Record<V2EquipSlot, string>>;
};

export type CombatLoadoutPresetSlots = Array<CombatLoadoutPreset | null>;

type CurrentCombatLoadout = Pick<
  CombatLoadoutPreset,
  "skills" | "pattern" | "equipment"
>;

function parseOne(value: unknown, slotIndex: number): CombatLoadoutPreset | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const trimmedName = typeof raw.name === "string" ? raw.name.trim() : "";
  const name = (trimmedName || `프리셋 ${slotIndex + 1}`).slice(
    0,
    COMBAT_LOADOUT_PRESET_NAME_MAX,
  );
  const skills: V2SkillId[] = [];
  const seenSkills = new Set<string>();
  if (Array.isArray(raw.skills)) {
    for (const value of raw.skills) {
      if (typeof value !== "string" || seenSkills.has(value)) continue;
      seenSkills.add(value);
      skills.push(value as V2SkillId);
    }
  }
  const equipment: Partial<Record<V2EquipSlot, string>> = {};
  if (raw.equipment && typeof raw.equipment === "object") {
    const rawEquipment = raw.equipment as Record<string, unknown>;
    for (const slot of COMBAT_LOADOUT_EQUIPMENT_SLOTS) {
      const iid = rawEquipment[slot];
      if (typeof iid === "string" && iid.length > 0) equipment[slot] = iid;
    }
  }
  return {
    name,
    savedAt: typeof raw.savedAt === "string" ? raw.savedAt : "",
    skills,
    pattern: raw.pattern == null ? null : parseCombatPattern(raw.pattern),
    equipment,
  };
}

export function parseCombatLoadoutPresets(
  value: unknown,
): CombatLoadoutPresetSlots {
  const rawSlots = Array.isArray(value) ? value : [];
  return Array.from({ length: COMBAT_LOADOUT_PRESET_SLOTS }, (_, slotIndex) =>
    parseOne(rawSlots[slotIndex], slotIndex),
  );
}

function orderedEqual(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

export function combatLoadoutPresetMatches(
  preset: CombatLoadoutPreset,
  current: CurrentCombatLoadout,
): boolean {
  if (!orderedEqual(preset.skills, current.skills)) return false;
  if (JSON.stringify(preset.pattern) !== JSON.stringify(current.pattern)) {
    return false;
  }
  return COMBAT_LOADOUT_EQUIPMENT_SLOTS.every(
    (slot) => preset.equipment[slot] === current.equipment[slot],
  );
}

export function eligiblePresetSkills(
  preset: CombatLoadoutPreset,
  learned: readonly V2SkillId[],
): { skills: V2SkillId[]; unavailableSkillIds: V2SkillId[] } {
  const learnedSet = new Set(learned);
  const skills: V2SkillId[] = [];
  const unavailableSkillIds: V2SkillId[] = [];
  for (const skillId of preset.skills) {
    if (learnedSet.has(skillId)) skills.push(skillId);
    else unavailableSkillIds.push(skillId);
  }
  return { skills, unavailableSkillIds };
}

export function eligiblePresetEquipment(
  preset: CombatLoadoutPreset,
  owned: readonly V2EquipInstance[],
): {
  equipment: Partial<Record<V2EquipSlot, string>>;
  unavailableEquipmentIids: string[];
} {
  const ownedByIid = new Map(owned.map((instance) => [instance.iid, instance]));
  const equipment: Partial<Record<V2EquipSlot, string>> = {};
  const unavailableEquipmentIids: string[] = [];
  for (const slot of COMBAT_LOADOUT_EQUIPMENT_SLOTS) {
    const iid = preset.equipment[slot];
    if (!iid) continue;
    const instance = ownedByIid.get(iid);
    if (instance && V2_EQUIPMENT[instance.id]?.slot === slot) {
      equipment[slot] = iid;
    } else {
      unavailableEquipmentIids.push(iid);
    }
  }
  return { equipment, unavailableEquipmentIids };
}
