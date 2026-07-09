import {
  FISHING_CODEX_KEY,
  fishCodexSpBonus,
  fishTierCompletions,
  parseFishCodex,
} from "@/adventure/v2/fishingCodex";
import {
  EQUIPMENT_CODEX_KEY,
  equipmentCodexSummary,
} from "@/adventure/data/v2/equipmentCodex";
import { readSave, type DbExecutor } from "./savesKv";

export function codexSpBonusFromRaw(
  fishingRaw: unknown,
  equipmentRaw?: unknown,
): {
  fishSp: number;
  equipmentSp: number;
  total: number;
  fishTiers: ReturnType<typeof fishTierCompletions>;
} {
  const fishCodex = parseFishCodex(fishingRaw);
  const fishTiers = fishTierCompletions(fishCodex);
  const fishSp = fishCodexSpBonus(fishCodex);
  const equipmentSp =
    equipmentRaw === undefined ? 0 : equipmentCodexSummary(equipmentRaw).spBonus;
  return {
    fishSp,
    equipmentSp,
    total: fishSp + equipmentSp,
    fishTiers,
  };
}

export async function readCodexSpBonus(
  executor: DbExecutor,
  userId: string,
): Promise<ReturnType<typeof codexSpBonusFromRaw>> {
  const [fishRaw, equipmentRaw] = await Promise.all([
    readSave(executor, userId, FISHING_CODEX_KEY, {}),
    readSave(executor, userId, EQUIPMENT_CODEX_KEY, {}),
  ]);
  return codexSpBonusFromRaw(fishRaw, equipmentRaw);
}
