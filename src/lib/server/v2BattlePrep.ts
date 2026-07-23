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
import { readJobUnlockContext } from "@/lib/server/jobUnlockContext";
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

type SavedCharacterForBattle = SavedCharacterV2 & Record<string, unknown>;

export type PreparedV2BattleActor = {
  player: DerivedPlayerCombatV2;
  skills: V2SkillsState;
  storedSkills: V2SkillsState;
  skillsRaw: unknown;
  proficiencyRaw: V2ProficiencyState;
  equipmentSave: unknown;
};

export async function prepareV2BattleActor({
  tx,
  userId,
  charSave,
  equipmentSave: preloadedEquipmentSave,
  deriveSkills = "stored",
  includeCookingBuff = true,
}: {
  tx: DbExecutor;
  userId: string;
  charSave: SavedCharacterForBattle;
  equipmentSave?: unknown;
  deriveSkills?: "stored" | "sanitized";
  /** 거점전처럼 플레이어 간 전투이면 false. */
  includeCookingBuff?: boolean;
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
  const jobUnlockCtx = V2_CORE_LOOP_V2
    ? await readJobUnlockContext(tx, userId)
    : undefined;
  const skills = V2_CORE_LOOP_V2
    ? sanitizeCombatLoadout(
        storedSkills,
        charSave,
        proficiencyRaw,
        codexBonus?.total ?? 0,
        jobUnlockCtx,
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
    includeCookingBuff,
  });
  if (!player) return null;

  return {
    player,
    skills,
    storedSkills,
    skillsRaw,
    proficiencyRaw,
    equipmentSave,
  };
}
