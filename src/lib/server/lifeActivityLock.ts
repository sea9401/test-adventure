import { eq } from "drizzle-orm";
import { users } from "@/db/schema";
import {
  MINING_AUTO_KEY,
  WOODCUTTING_AUTO_KEY,
  parseAutoGatheringState,
  type AutoGatheringActivity,
  type AutoGatheringState,
} from "@/adventure/v2/autoGathering";
import {
  FISHING_SESSION_KEY,
  parseFishingSession,
} from "@/adventure/v2/fishingSession";
import {
  MINING_SESSION_KEY,
  parseMiningSession,
} from "@/adventure/v2/miningSession";
import {
  WOODCUTTING_SESSION_KEY,
  parseWoodcuttingSession,
} from "@/adventure/v2/woodcuttingSession";
import {
  lockSaveForUpdate,
  readSave,
  type DbExecutor,
} from "@/lib/server/savesKv";

export type LockedAutoGatheringStates = {
  woodcutting: AutoGatheringState;
  mining: AutoGatheringState;
};

export type ManualLifeActivity = "fishing" | AutoGatheringActivity;

// users 행은 ensureUser 가 항상 보장한다. savesKv 신규 키는 행이 없어 FOR UPDATE 로
// 직렬화할 수 없으므로, 생활 활동 요청은 이 사용자 행을 첫 잠금으로 잡아 경쟁 요청을 막는다.
async function lockLifeActivityUser(
  tx: DbExecutor,
  userId: string,
): Promise<void> {
  await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .for("update")
    .limit(1);
}

export function activeAutoGatheringActivity(
  states: LockedAutoGatheringStates,
): AutoGatheringActivity | null {
  const woodcutting = states.woodcutting.session;
  const mining = states.mining.session;
  if (!woodcutting) return mining ? "mining" : null;
  if (!mining) return "woodcutting";
  return woodcutting.startedAt <= mining.startedAt ? "woodcutting" : "mining";
}

export async function lockAutoGatheringStatesForUpdate(
  tx: DbExecutor,
  userId: string,
): Promise<LockedAutoGatheringStates> {
  await lockLifeActivityUser(tx, userId);
  // 모든 호출처에서 고정 순서로 잠가 교차 벌목/채광 요청의 데드락을 피한다.
  const woodcutting = parseAutoGatheringState(
    await lockSaveForUpdate(tx, userId, WOODCUTTING_AUTO_KEY, {}),
  );
  const mining = parseAutoGatheringState(
    await lockSaveForUpdate(tx, userId, MINING_AUTO_KEY, {}),
  );
  return { woodcutting, mining };
}

export async function readActiveAutoGatheringActivity(
  executor: DbExecutor,
  userId: string,
): Promise<AutoGatheringActivity | null> {
  const [woodcuttingRaw, miningRaw] = await Promise.all([
    readSave(executor, userId, WOODCUTTING_AUTO_KEY, {}),
    readSave(executor, userId, MINING_AUTO_KEY, {}),
  ]);
  return activeAutoGatheringActivity({
    woodcutting: parseAutoGatheringState(woodcuttingRaw),
    mining: parseAutoGatheringState(miningRaw),
  });
}

// 자동 작업 시작 시 기존 수동 세션 세 종류를 모두 잠그고 검사한다. 만료된 세션은
// 새 활동을 막지 않는다. 잠금 순서는 fishing → woodcutting → mining 으로 고정한다.
export async function lockActiveManualLifeActivity(
  tx: DbExecutor,
  userId: string,
  now: number,
): Promise<ManualLifeActivity | null> {
  const fishing = parseFishingSession(
    await lockSaveForUpdate(tx, userId, FISHING_SESSION_KEY, {}),
  );
  const woodcutting = parseWoodcuttingSession(
    await lockSaveForUpdate(tx, userId, WOODCUTTING_SESSION_KEY, {}),
  );
  const mining = parseMiningSession(
    await lockSaveForUpdate(tx, userId, MINING_SESSION_KEY, {}),
  );
  if (fishing && now <= fishing.expiresAt) return "fishing";
  if (woodcutting && now <= woodcutting.expiresAt) return "woodcutting";
  if (mining && now <= mining.expiresAt) return "mining";
  return null;
}
