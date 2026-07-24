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
  // executor 는 단일 pg client 를 쓰는 transaction 일 수 있다. 같은 client 에
  // client.query 를 겹쳐 호출하면 pg 9 에서 오류가 되므로 항상 순서대로 읽는다.
  const fishRaw = await readSave(executor, userId, FISHING_CODEX_KEY, {});
  const equipmentRaw = await readSave(
    executor,
    userId,
    EQUIPMENT_CODEX_KEY,
    {},
  );
  return codexSpBonusFromRaw(fishRaw, equipmentRaw);
}
