import { db } from "@/db";
import {
  lockSavesForUpdate,
  readSaves,
  upsertSaves,
} from "@/lib/server/savesKv";
import type { V2BattlePrepCache } from "@/lib/server/v2BattlePrep";
import type { GuildDiningEffectCache } from "@/lib/server/guildDining";
import type { ActiveHotTime } from "@/lib/server/opsSettings";
import { guildCombatSupplyBonuses } from "@/adventure/data/v2/guildCombatSupply";
import type { EquipmentSave } from "@/adventure/data/v2/v2Equipment";
import type { LiberationHuntSnapshot } from "@/adventure/data/v2/equipmentLiberationEffects";
import { EQUIPMENT_CODEX_KEY } from "@/adventure/data/v2/equipmentCodex";
import { FISHING_CODEX_KEY } from "@/adventure/v2/fishingCodex";
import { GUILD_DINING_USER_SAVE_KEY } from "@/adventure/data/v2/guildDining";
import { codexSpBonusFromRaw } from "@/lib/server/codexSpBonus";
import type { AdventureLogSave } from "./huntKillLog";
import type { HuntCharacterSave } from "./huntCharacter";

export type HuntTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];

export type HuntOccupationRow = {
  occupiedByGuildId: number | null;
  policy: string;
};

export type HuntInventorySave = {
  hpCharges?: number;
  mpCharges?: number;
  [key: string]: unknown;
};

export type HuntBatchState = {
  savesPreloaded?: boolean;
  deferGuildExploration?: boolean;
  occupationById?: Map<string, HuntOccupationRow>;
  viewerGuildId?: number | null;
  guildCombatSupply?: ReturnType<typeof guildCombatSupplyBonuses>;
  charSave?: HuntCharacterSave;
  charSaveDirty?: boolean;
  equipmentSave?: EquipmentSave;
  equipmentSaveDirty?: boolean;
  inventorySave?: HuntInventorySave;
  inventorySaveDirty?: boolean;
  playerName?: string;
  hotTime?: ActiveHotTime;
  dining: GuildDiningEffectCache;
  adventureLog?: AdventureLogSave;
  adventureLogDirty?: boolean;
  equipmentCodexRaw?: unknown;
  actor: V2BattlePrepCache;
  proficiencyDirty?: boolean;
  liberationSnapshot?: LiberationHuntSnapshot;
};

export async function preloadHuntSaves(
  tx: HuntTransaction,
  userId: string,
  state: HuntBatchState,
): Promise<void> {
  if (state.savesPreloaded) return;
  const locked = await lockSavesForUpdate(tx, userId, {
    "adventure-log.v2": {} as AdventureLogSave,
    "equipment.v2": {} as EquipmentSave,
    [GUILD_DINING_USER_SAVE_KEY]: {} as Record<string, unknown>,
    "inventory.v2": {} as HuntInventorySave,
    "proficiency.v2": {} as NonNullable<
      V2BattlePrepCache["proficiencyRaw"]
    >,
    "skills.v2": {} as Record<string, unknown>,
  });
  const readOnly = await readSaves(tx, userId, {
    "character-profile.v2": null as { name?: string } | null,
    [EQUIPMENT_CODEX_KEY]: {} as Record<string, unknown>,
    [FISHING_CODEX_KEY]: {} as Record<string, unknown>,
  });

  state.equipmentSave = locked["equipment.v2"];
  state.inventorySave = locked["inventory.v2"];
  state.adventureLog = locked["adventure-log.v2"];
  state.equipmentCodexRaw = readOnly[EQUIPMENT_CODEX_KEY];
  state.playerName =
    readOnly["character-profile.v2"]?.name?.trim() || "모험가";
  state.actor.skillsRaw = locked["skills.v2"];
  state.actor.proficiencyRaw = locked["proficiency.v2"];
  state.actor.codexBonus = codexSpBonusFromRaw(
    readOnly[FISHING_CODEX_KEY],
    readOnly[EQUIPMENT_CODEX_KEY],
  );
  state.dining.initialized = true;
  state.dining.locked = true;
  state.dining.raw = locked[GUILD_DINING_USER_SAVE_KEY];
  state.savesPreloaded = true;
}

export async function flushHuntSaves(
  tx: HuntTransaction,
  userId: string,
  state: HuntBatchState,
): Promise<void> {
  const entries: Record<string, unknown> = {};
  if (state.equipmentSaveDirty && state.equipmentSave) {
    entries["equipment.v2"] = state.equipmentSave;
  }
  if (state.inventorySaveDirty && state.inventorySave) {
    entries["inventory.v2"] = state.inventorySave;
  }
  if (state.charSaveDirty && state.charSave) {
    entries["character.v2"] = state.charSave;
  }
  if (state.proficiencyDirty && state.actor.proficiencyRaw) {
    entries["proficiency.v2"] = state.actor.proficiencyRaw;
  }
  if (state.adventureLogDirty && state.adventureLog) {
    entries["adventure-log.v2"] = state.adventureLog;
  }
  if (state.dining.dirty && state.dining.raw) {
    entries[GUILD_DINING_USER_SAVE_KEY] = state.dining.raw;
  }
  await upsertSaves(tx, userId, entries);
  state.equipmentSaveDirty = false;
  state.inventorySaveDirty = false;
  state.charSaveDirty = false;
  state.proficiencyDirty = false;
  state.adventureLogDirty = false;
  state.dining.dirty = false;
}
