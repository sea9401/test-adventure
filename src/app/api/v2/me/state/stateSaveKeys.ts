import { EQUIPMENT_CODEX_KEY } from "@/adventure/data/v2/equipmentCodex";
import { GUILD_DINING_USER_SAVE_KEY } from "@/adventure/data/v2/guildDining";
import { PROFILE_SHOWCASE_SAVE_KEY } from "@/adventure/profile/profileShowcase";
import {
  MINING_AUTO_KEY,
  WOODCUTTING_AUTO_KEY,
} from "@/adventure/v2/autoGathering";
import { COOKING_SAVE_KEY } from "@/adventure/v2/cooking/state";
import { FARM_SAVE_KEY } from "@/adventure/v2/farm";
import { MINING_LOG_KEY } from "@/adventure/v2/miningSession";
import { STAMINA_POTIONS_KEY } from "@/adventure/v2/staminaPotions";
import { WOODCUTTING_LOG_KEY } from "@/adventure/v2/woodcuttingSession";

export const STATE_SAVE_KEYS = [
  "character.v2",
  "character-profile.v2",
  "equipment.v2",
  "skills.v2",
  "proficiency.v2",
  "fishing-codex.v1",
  "adventure-log.v2",
  STAMINA_POTIONS_KEY,
  "inventory.v2",
  EQUIPMENT_CODEX_KEY,
  FARM_SAVE_KEY,
  COOKING_SAVE_KEY,
  WOODCUTTING_LOG_KEY,
  MINING_LOG_KEY,
  WOODCUTTING_AUTO_KEY,
  MINING_AUTO_KEY,
  PROFILE_SHOWCASE_SAVE_KEY,
  GUILD_DINING_USER_SAVE_KEY,
] as const;

export type StateSaveKey = (typeof STATE_SAVE_KEYS)[number];

export const CORE_STATE_SAVE_KEYS = [
  "character.v2",
  "character-profile.v2",
  "equipment.v2",
  "skills.v2",
  "proficiency.v2",
  "fishing-codex.v1",
  "adventure-log.v2",
  STAMINA_POTIONS_KEY,
  "inventory.v2",
  EQUIPMENT_CODEX_KEY,
  WOODCUTTING_AUTO_KEY,
  MINING_AUTO_KEY,
] as const satisfies readonly StateSaveKey[];
