import "server-only";

import {
  V2_EQUIPMENT,
  parseCraftedBy,
  parseEquipRollForItem,
  parseEquipmentSave,
  parseInstanceCraftQuality,
  type V2EquipInstance,
} from "@/adventure/data/v2/v2Equipment";
import { derivePowerScore } from "@/adventure/data/v2/power";
import { parseEnhance } from "@/adventure/data/v2/v2Enhance";
import {
  derivePlayerCombatV2FromSaves,
  type DerivedPlayerCombatV2,
  type SavedCharacterV2,
} from "@/lib/server/derivePlayerCombatV2";

export type EquipmentPowerPreviewResult =
  | {
      ok: true;
      currentPower: number;
      candidatePower: number;
      delta: number;
    }
  | {
      ok: false;
      error: "not_owned" | "no_character" | "invalid_candidate";
    };

export type EquipmentPowerPreviewCandidate =
  | { iid: string }
  | {
      itemId: unknown;
      roll?: unknown;
      enhance?: unknown;
      craftQuality?: unknown;
      craftedBy?: unknown;
    };

function powerOf(combat: DerivedPlayerCombatV2): number {
  return derivePowerScore({
    atk: combat.player.atk,
    magicAtk: combat.player.magicAtk ?? 0,
    def: combat.player.def,
    spd: combat.player.spd,
    maxHp: combat.maxHp,
    maxMp: combat.player.maxMp ?? 0,
  });
}

/** 후보 장비를 저장하지 않고 같은 슬롯에 임시 장착해 현재·변경 후 전투력을 계산한다. */
export function previewEquipmentPowerFromSaves(input: {
  character: SavedCharacterV2 | undefined;
  equipmentSave: unknown;
  proficiencyRaw: unknown;
  skillsRaw: unknown;
  candidate: EquipmentPowerPreviewCandidate;
}): EquipmentPowerPreviewResult {
  if (!input.character) return { ok: false, error: "no_character" };

  const { owned, equipped } = parseEquipmentSave(input.equipmentSave);
  let candidate: V2EquipInstance | undefined;
  let previewOwned = owned;
  if ("iid" in input.candidate) {
    const candidateIid = input.candidate.iid;
    candidate = owned.find((item) => item.iid === candidateIid);
    if (!candidate) return { ok: false, error: "not_owned" };
  } else {
    const itemId = input.candidate.itemId;
    if (typeof itemId !== "string" || !(itemId in V2_EQUIPMENT)) {
      return { ok: false, error: "invalid_candidate" };
    }
    const craftedBy = parseCraftedBy(input.candidate.craftedBy);
    const craftQuality = parseInstanceCraftQuality(
      input.candidate.craftQuality,
      input.candidate.enhance,
      craftedBy,
    );
    let previewIid = "__equipment_power_preview__";
    while (owned.some((item) => item.iid === previewIid)) previewIid += "_";
    candidate = {
      iid: previewIid,
      id: itemId as keyof typeof V2_EQUIPMENT,
      roll: parseEquipRollForItem(
        V2_EQUIPMENT[itemId as keyof typeof V2_EQUIPMENT],
        input.candidate.roll,
      ),
      enhance: craftQuality
        ? undefined
        : parseEnhance(input.candidate.enhance),
      craftQuality,
      craftedBy,
    };
    previewOwned = [...owned, candidate];
  }

  const current = derivePlayerCombatV2FromSaves({
    character: input.character,
    equipmentSave: { owned, equipped },
    proficiencyRaw: input.proficiencyRaw,
    skillsRaw: input.skillsRaw,
  });
  const candidateItem = V2_EQUIPMENT[candidate.id];
  const candidateCombat = derivePlayerCombatV2FromSaves({
    character: input.character,
    equipmentSave: {
      owned: previewOwned,
      equipped: { ...equipped, [candidateItem.slot]: candidate.iid },
    },
    proficiencyRaw: input.proficiencyRaw,
    skillsRaw: input.skillsRaw,
  });
  if (!current || !candidateCombat) {
    return { ok: false, error: "no_character" };
  }

  const currentPower = powerOf(current);
  const candidatePower = powerOf(candidateCombat);
  return {
    ok: true,
    currentPower,
    candidatePower,
    delta: candidatePower - currentPower,
  };
}
