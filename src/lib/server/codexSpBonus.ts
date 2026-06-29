import {
  FISHING_CODEX_KEY,
  fishCodexSpBonus,
  fishTierCompletions,
  parseFishCodex,
} from "@/adventure/v2/fishingCodex";
import {
  TREASURE_CODEX_KEY,
  antiqueTierCompletions,
  parseTreasureCodex,
  treasureCodexSpBonus,
} from "@/adventure/v2/treasureCodex";
import {
  EQUIPMENT_CODEX_KEY,
  equipmentCodexSummary,
} from "@/adventure/data/v2/equipmentCodex";
import { readSave, type DbExecutor } from "./savesKv";

export function codexSpBonusFromRaw(
  fishingRaw: unknown,
  treasureRaw: unknown,
  equipmentRaw?: unknown,
): {
  fishSp: number;
  treasureSp: number;
  equipmentSp: number;
  total: number;
  fishTiers: ReturnType<typeof fishTierCompletions>;
  treasureTiers: ReturnType<typeof antiqueTierCompletions>;
} {
  const fishCodex = parseFishCodex(fishingRaw);
  const treasureCodex = parseTreasureCodex(treasureRaw);
  const fishTiers = fishTierCompletions(fishCodex);
  const treasureTiers = antiqueTierCompletions(treasureCodex);
  const fishSp = fishCodexSpBonus(fishCodex);
  const treasureSp = treasureCodexSpBonus(treasureCodex);
  const equipmentSp =
    equipmentRaw === undefined ? 0 : equipmentCodexSummary(equipmentRaw).spBonus;
  return {
    fishSp,
    treasureSp,
    equipmentSp,
    total: fishSp + treasureSp + equipmentSp,
    fishTiers,
    treasureTiers,
  };
}

export async function readCodexSpBonus(
  executor: DbExecutor,
  userId: string,
): Promise<ReturnType<typeof codexSpBonusFromRaw>> {
  const [fishRaw, treasureRaw, equipmentRaw] = await Promise.all([
    readSave(executor, userId, FISHING_CODEX_KEY, {}),
    readSave(executor, userId, TREASURE_CODEX_KEY, {}),
    readSave(executor, userId, EQUIPMENT_CODEX_KEY, {}),
  ]);
  return codexSpBonusFromRaw(fishRaw, treasureRaw, equipmentRaw);
}
