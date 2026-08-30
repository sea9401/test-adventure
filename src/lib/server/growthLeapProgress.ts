import {
  GROWTH_LEAP_SAVE_KEY,
  growthLeapMissionView,
  parseGrowthLeapSave,
  recordGrowthLeapStamina,
  type GrowthLeapMissionView,
} from "@/adventure/data/v2/growthLeap";
import {
  lockSaveForUpdate,
  upsertSave,
  type DbTransactionExecutor,
} from "./savesKv";

export async function recordGrowthLeapStaminaSpendInTx(
  tx: DbTransactionExecutor,
  userId: string,
  amount: number,
  now: number = Date.now(),
): Promise<GrowthLeapMissionView> {
  const raw = await lockSaveForUpdate(tx, userId, GROWTH_LEAP_SAVE_KEY, {});
  const current = parseGrowthLeapSave(raw);
  const next = recordGrowthLeapStamina(current, amount, now);
  if (
    next.mission &&
    next.mission.staminaSpent !== current.mission?.staminaSpent
  ) {
    await upsertSave(tx, userId, GROWTH_LEAP_SAVE_KEY, next);
  }
  return growthLeapMissionView(next, now);
}
