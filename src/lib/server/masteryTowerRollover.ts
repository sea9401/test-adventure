import {
  MASTERY_CERTIFICATE_KEY,
  MASTERY_TOWER_SAVE_KEY,
  type MasteryTowerRolloverReward,
  rolloverMasteryTowerState,
} from "@/adventure/data/v2/masteryTower";
import {
  type DbExecutor,
  lockSaveForUpdate,
  upsertSave,
} from "@/lib/server/savesKv";

export type MasteryTowerRolloverSettlement = {
  tower: ReturnType<typeof rolloverMasteryTowerState>["tower"];
  autoClaimedReward: MasteryTowerRolloverReward | null;
  certificates: number | null;
};

/**
 * 날짜 변경과 전날 미수령 보상 지급을 같은 트랜잭션에서 처리한다.
 * 숙련의 탑 저장 행을 먼저 잠그므로 동시 요청이 들어와도 한 요청만 지급한다.
 */
export async function settleMasteryTowerRollover(
  tx: DbExecutor,
  userId: string,
  date: string,
): Promise<MasteryTowerRolloverSettlement> {
  const rawTower = await lockSaveForUpdate<unknown>(
    tx,
    userId,
    MASTERY_TOWER_SAVE_KEY,
    {},
  );
  const rollover = rolloverMasteryTowerState(rawTower, date);
  if (!rollover.rolledOver) {
    return {
      tower: rollover.tower,
      autoClaimedReward: null,
      certificates: null,
    };
  }

  let certificates: number | null = null;
  if (rollover.reward) {
    const inventory = await lockSaveForUpdate<Record<string, unknown>>(
      tx,
      userId,
      "inventory.v2",
      {},
    );
    const held = Math.max(
      0,
      Math.floor(Number(inventory[MASTERY_CERTIFICATE_KEY]) || 0),
    );
    certificates = held + rollover.reward.total;
    await upsertSave(tx, userId, "inventory.v2", {
      ...inventory,
      [MASTERY_CERTIFICATE_KEY]: certificates,
    });
  }

  await upsertSave(tx, userId, MASTERY_TOWER_SAVE_KEY, rollover.tower);
  return {
    tower: rollover.tower,
    autoClaimedReward: rollover.reward,
    certificates,
  };
}
