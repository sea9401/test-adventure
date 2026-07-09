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
  _treasureRaw: unknown,
  equipmentRaw?: unknown,
): {
  fishSp: number;
  treasureSp: number;
  equipmentSp: number;
  total: number;
  fishTiers: ReturnType<typeof fishTierCompletions>;
  treasureTiers: [];
} {
  const fishCodex = parseFishCodex(fishingRaw);
  const fishTiers = fishTierCompletions(fishCodex);
  const fishSp = fishCodexSpBonus(fishCodex);
  const treasureSp = 0;
  const equipmentSp =
    equipmentRaw === undefined ? 0 : equipmentCodexSummary(equipmentRaw).spBonus;
  return {
    fishSp,
    treasureSp,
    equipmentSp,
    total: fishSp + treasureSp + equipmentSp,
    fishTiers,
    treasureTiers: [],
  };
}

export async function readCodexSpBonus(
  executor: DbExecutor,
  userId: string,
): Promise<ReturnType<typeof codexSpBonusFromRaw>> {
  const [fishRaw, treasureRaw, equipmentRaw] = await Promise.all([
    readSave(executor, userId, FISHING_CODEX_KEY, {}),
    Promise.resolve({}),
    readSave(executor, userId, EQUIPMENT_CODEX_KEY, {}),
  ]);
  return codexSpBonusFromRaw(fishRaw, treasureRaw, equipmentRaw);
}
