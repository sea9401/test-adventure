import {
  parseV2Element,
  type V2Element,
} from "@/adventure/data/v2/elements";
import {
  emptyProficiency,
  type V2ProficiencyState,
} from "@/adventure/data/v2/proficiency";
import {
  emptyV2SkillsState,
  parseV2SkillsState,
  type V2SkillsState,
} from "@/adventure/data/v2/v2Skills";
import { V2_CORE_LOOP_V2 } from "@/adventure/data/v2/coreLoopConfig";
import { readCodexSpBonus } from "@/lib/server/codexSpBonus";
import {
  derivePlayerCombatV2,
  type DerivedPlayerCombatV2,
  type SavedCharacterV2,
} from "@/lib/server/derivePlayerCombatV2";
import {
  lockSaveForUpdate,
  type DbExecutor,
} from "@/lib/server/savesKv";
import { sanitizeCombatLoadout } from "@/lib/server/v2Skills";

type SavedCharacterForBattle = SavedCharacterV2 & {
  element?: unknown;
  [key: string]: unknown;
};

export type PreparedV2BattleActor = {
  player: DerivedPlayerCombatV2;
  skills: V2SkillsState;
  storedSkills: V2SkillsState;
  skillsRaw: unknown;
  proficiencyRaw: V2ProficiencyState;
  equipmentSave: unknown;
  playerElement: V2Element;
  basicAttackElement: V2Element;
};

export async function prepareV2BattleActor({
  tx,
  userId,
  charSave,
  equipmentSave: preloadedEquipmentSave,
  deriveSkills = "stored",
}: {
  tx: DbExecutor;
  userId: string;
  charSave: SavedCharacterForBattle;
  equipmentSave?: unknown;
  deriveSkills?: "stored" | "sanitized";
}): Promise<PreparedV2BattleActor | null> {
  const equipmentSave =
    preloadedEquipmentSave ??
    (await lockSaveForUpdate(tx, userId, "equipment.v2", {}));
  const skillsRaw = await lockSaveForUpdate(
    tx,
    userId,
    "skills.v2",
    emptyV2SkillsState() as unknown as Record<string, unknown>,
  );
  const proficiencyRaw = await lockSaveForUpdate<V2ProficiencyState>(
    tx,
    userId,
    "proficiency.v2",
    emptyProficiency(),
  );
  const storedSkills = parseV2SkillsState(skillsRaw);
  const codexBonus = V2_CORE_LOOP_V2 ? await readCodexSpBonus(tx, userId) : null;
  const skills = V2_CORE_LOOP_V2
    ? sanitizeCombatLoadout(
        storedSkills,
        charSave,
        proficiencyRaw,
        codexBonus?.total ?? 0,
      )
    : storedSkills;
  const deriveSkillsRaw =
    deriveSkills === "sanitized"
      ? { ...storedSkills, equipped: skills.equipped }
      : skillsRaw;
  const player = await derivePlayerCombatV2(userId, tx, {
    character: charSave,
    equipmentSave,
    proficiencyRaw,
    skillsRaw: deriveSkillsRaw,
  });
  if (!player) return null;

  const playerElement = parseV2Element(charSave.element);
  const basicAttackElement =
    player.weaponElement !== "neutral" ? player.weaponElement : playerElement;

  return {
    player,
    skills,
    storedSkills,
    skillsRaw,
    proficiencyRaw,
    equipmentSave,
    playerElement,
    basicAttackElement,
  };
}
