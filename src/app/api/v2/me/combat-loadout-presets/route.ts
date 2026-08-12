import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import {
  lockSaveForUpdate,
  readSave,
  upsertSave,
  type DbExecutor,
} from "@/lib/server/savesKv";
import {
  COMBAT_LOADOUT_PRESET_NAME_MAX,
  combatLoadoutPresetMatches,
  eligiblePresetEquipment,
  eligiblePresetSkills,
  parseCombatLoadoutPresets,
  type CombatLoadoutPreset,
  type CombatLoadoutPresetSlots,
} from "@/adventure/data/v2/combatLoadoutPresets";
import {
  emptyV2SkillsState,
  parseV2SkillsState,
  type V2SkillsState,
} from "@/adventure/data/v2/v2Skills";
import {
  parseEquipmentSave,
  type EquipmentSave,
} from "@/adventure/data/v2/v2Equipment";
import {
  emptyProficiency,
  type V2ProficiencyState,
} from "@/adventure/data/v2/proficiency";
import { sanitizeCombatLoadout } from "@/lib/server/v2Skills";
import { readCodexSpBonus } from "@/lib/server/codexSpBonus";
import { readJobUnlockContext } from "@/lib/server/jobUnlockContext";
import { COMBAT_LOADOUT_PRESETS_KEY } from "@/lib/storage-keys";

export { COMBAT_LOADOUT_PRESETS_KEY };

type CurrentCombatLoadout = {
  skills: V2SkillsState["equipped"];
  pattern: NonNullable<V2SkillsState["pattern"]> | null;
  equipment: ReturnType<typeof parseEquipmentSave>["equipped"];
};

function stateResponse(
  presets: CombatLoadoutPresetSlots,
  skillsRaw: unknown,
  equipmentRaw: unknown,
) {
  const skills = parseV2SkillsState(skillsRaw);
  const { equipped } = parseEquipmentSave(equipmentRaw);
  const current: CurrentCombatLoadout = {
    skills: skills.equipped,
    pattern: skills.pattern ?? null,
    equipment: equipped,
  };
  const activeIndex = presets.findIndex(
    (preset) => preset != null && combatLoadoutPresetMatches(preset, current),
  );
  return {
    ok: true as const,
    presets,
    activeSlot: activeIndex >= 0 ? activeIndex : null,
    current,
  };
}

async function readCurrent(executor: DbExecutor, userId: string) {
  const [skillsRaw, equipmentRaw] = await Promise.all([
    readSave(executor, userId, "skills.v2", emptyV2SkillsState()),
    readSave(executor, userId, "equipment.v2", {}),
  ]);
  return { skillsRaw, equipmentRaw };
}

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const [presetsRaw, current] = await Promise.all([
    readSave(db, userId, COMBAT_LOADOUT_PRESETS_KEY, []),
    readCurrent(db, userId),
  ]);
  return Response.json(
    stateResponse(
      parseCombatLoadoutPresets(presetsRaw),
      current.skillsRaw,
      current.equipmentRaw,
    ),
  );
}

type MutationBody = {
  action?: unknown;
  slot?: unknown;
  name?: unknown;
};

function validSlot(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) < 5;
}

function presetName(
  bodyName: unknown,
  previous: CombatLoadoutPreset | null,
  slot: number,
): string {
  const requested = typeof bodyName === "string" ? bodyName.trim() : "";
  return (requested || previous?.name || `프리셋 ${slot + 1}`).slice(
    0,
    COMBAT_LOADOUT_PRESET_NAME_MAX,
  );
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: MutationBody;
  try {
    body = (await req.json()) as MutationBody;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (!validSlot(body.slot)) {
    return Response.json({ ok: false, error: "bad_slot" }, { status: 400 });
  }
  if (!new Set(["save", "apply", "delete"]).has(String(body.action))) {
    return Response.json({ ok: false, error: "bad_action" }, { status: 400 });
  }
  const slot = body.slot;

  const result = await db.transaction(async (tx) => {
    const presets = parseCombatLoadoutPresets(
      await lockSaveForUpdate(
        tx,
        userId,
        COMBAT_LOADOUT_PRESETS_KEY,
        [],
      ),
    );

    if (body.action === "save") {
      const equipmentRaw = await lockSaveForUpdate<EquipmentSave>(
        tx,
        userId,
        "equipment.v2",
        {},
      );
      const skillsRaw = await lockSaveForUpdate<V2SkillsState>(
        tx,
        userId,
        "skills.v2",
        emptyV2SkillsState(),
      );
      const skills = parseV2SkillsState(skillsRaw);
      const { equipped } = parseEquipmentSave(equipmentRaw);
      const next = [...presets];
      next[slot] = {
        name: presetName(body.name, presets[slot], slot),
        savedAt: new Date().toISOString(),
        skills: skills.equipped,
        pattern: skills.pattern ?? null,
        equipment: equipped,
      };
      const parsedNext = parseCombatLoadoutPresets(next);
      await upsertSave(tx, userId, COMBAT_LOADOUT_PRESETS_KEY, parsedNext);
      return {
        status: 200,
        body: stateResponse(parsedNext, skills, equipmentRaw),
      };
    }

    if (body.action === "delete") {
      const next = [...presets];
      next[slot] = null;
      await upsertSave(tx, userId, COMBAT_LOADOUT_PRESETS_KEY, next);
      const current = await readCurrent(tx, userId);
      return {
        status: 200,
        body: stateResponse(next, current.skillsRaw, current.equipmentRaw),
      };
    }

    const preset = presets[slot];
    if (!preset) {
      return {
        status: 404,
        body: { ok: false as const, error: "empty_slot" as const },
      };
    }

    const character = await lockSaveForUpdate<Record<string, unknown>>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const equipmentRaw = await lockSaveForUpdate<EquipmentSave>(
      tx,
      userId,
      "equipment.v2",
      {},
    );
    const skillsRaw = await lockSaveForUpdate<V2SkillsState>(
      tx,
      userId,
      "skills.v2",
      emptyV2SkillsState(),
    );
    const proficiencyRaw = await lockSaveForUpdate<V2ProficiencyState>(
      tx,
      userId,
      "proficiency.v2",
      emptyProficiency(),
    );
    const skills = parseV2SkillsState(skillsRaw);
    const equipmentSave = parseEquipmentSave(equipmentRaw);
    const eligibleSkills = eligiblePresetSkills(preset, skills.learned);
    const sanitized = sanitizeCombatLoadout(
      { ...skills, equipped: eligibleSkills.skills },
      character,
      proficiencyRaw,
      (await readCodexSpBonus(tx, userId)).total,
      await readJobUnlockContext(tx, userId),
    );
    const finalSkillSet = new Set(sanitized.equipped);
    const excludedSkillIds = [
      ...eligibleSkills.unavailableSkillIds,
      ...eligibleSkills.skills.filter((skillId) => !finalSkillSet.has(skillId)),
    ];
    const eligibleEquipment = eligiblePresetEquipment(
      preset,
      equipmentSave.owned,
    );
    const nextSkills: V2SkillsState = {
      ...sanitized,
      pattern: preset.pattern ?? undefined,
    };
    const nextEquipment: EquipmentSave = {
      owned: equipmentSave.owned,
      equipped: eligibleEquipment.equipment,
    };
    await upsertSave(tx, userId, "equipment.v2", nextEquipment);
    await upsertSave(tx, userId, "skills.v2", nextSkills);

    const nextCharacter = { ...character };
    let characterChanged = false;
    if (
      sanitized.equipped.length > 0 &&
      character.hasEditedSkillLoadout !== true
    ) {
      nextCharacter.hasEditedSkillLoadout = true;
      characterChanged = true;
    }
    if (
      Object.keys(eligibleEquipment.equipment).length > 0 &&
      character.hasManuallyEquippedGear !== true
    ) {
      nextCharacter.hasManuallyEquippedGear = true;
      characterChanged = true;
    }
    if (characterChanged) {
      await upsertSave(tx, userId, "character.v2", nextCharacter);
    }

    return {
      status: 200,
      body: {
        ...stateResponse(presets, nextSkills, nextEquipment),
        excluded: {
          skillIds: [...new Set(excludedSkillIds)],
          equipmentIids: eligibleEquipment.unavailableEquipmentIids,
        },
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
