import {
  OFFLINE_MAX_BATTLES,
  OFFLINE_SETTLE_BATCH_SIZE,
} from "@/adventure/data/v2/coreLoopConfig";
import type { AutoHuntStopReason } from "@/adventure/v2/autoHuntStopPolicy";

export type OfflineSettleResult = {
  battles: number;
  wins: number;
  losses: number;
  totalExp: number;
  totalGold: number;
  totalLossTax: number;
  totalProficiency: number;
  totalMastery: number;
  levelsGained: number;
  spMilestonesGained: number;
  depth: number;
  remainingBattles: number;
  stoppedReason: AutoHuntStopReason | "hp" | "error" | null;
};

export function offlineSettleStopReasonLabel(
  reason: OfflineSettleResult["stoppedReason"],
): string | null {
  if (reason === "potion") return "충전약 정지 조건 도달";
  if (reason === "rare_map") return "희귀 탐사맵 발견으로 정지";
  if (reason === "level_100") return "레벨 100 도달로 정지";
  if (reason === "hp") return "체력 부족으로 정지";
  if (reason === "error") return "처리 오류로 정지";
  return null;
}

type OfflineSettleBatch = Partial<OfflineSettleResult> & {
  ok?: boolean;
  disabled?: boolean;
};

const MAX_SETTLE_REQUESTS =
  Math.ceil(OFFLINE_MAX_BATTLES / OFFLINE_SETTLE_BATCH_SIZE) + 1;
const BETWEEN_BATCH_DELAY_MS = 400;

function emptyResult(): OfflineSettleResult {
  return {
    battles: 0,
    wins: 0,
    losses: 0,
    totalExp: 0,
    totalGold: 0,
    totalLossTax: 0,
    totalProficiency: 0,
    totalMastery: 0,
    levelsGained: 0,
    spMilestonesGained: 0,
    depth: 0,
    remainingBattles: 0,
    stoppedReason: null,
  };
}

export async function settleOfflineHuntBatches(
  fetcher: typeof fetch = fetch,
  wait: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => window.setTimeout(resolve, ms)),
): Promise<OfflineSettleResult> {
  const total = emptyResult();
  for (
    let requestIndex = 0;
    requestIndex < MAX_SETTLE_REQUESTS;
    requestIndex += 1
  ) {
    const response = await fetcher("/api/v2/me/offline-settle", {
      method: "POST",
    });
    if (!response.ok) throw new Error(`offline_settle_${response.status}`);
    const batch = (await response.json()) as OfflineSettleBatch;
    total.battles += batch.battles ?? 0;
    total.wins += batch.wins ?? 0;
    total.losses += batch.losses ?? 0;
    total.totalExp += batch.totalExp ?? 0;
    total.totalGold += batch.totalGold ?? 0;
    total.totalLossTax += batch.totalLossTax ?? 0;
    total.totalProficiency += batch.totalProficiency ?? 0;
    total.totalMastery += batch.totalMastery ?? 0;
    total.levelsGained += batch.levelsGained ?? 0;
    total.spMilestonesGained += batch.spMilestonesGained ?? 0;
    total.depth = batch.depth ?? total.depth;
    total.remainingBattles = batch.remainingBattles ?? 0;
    total.stoppedReason = batch.stoppedReason ?? total.stoppedReason;
    if (batch.disabled || total.remainingBattles <= 0) return total;
    await wait(BETWEEN_BATCH_DELAY_MS);
  }
  throw new Error("offline_settle_batch_limit");
}
