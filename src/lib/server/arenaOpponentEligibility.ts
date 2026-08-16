import { excludeArenaOperatorAccounts } from "@/lib/server/arenaOperatorEligibility";
import { filterRankingEligibleRows } from "@/lib/server/rankingEligibility";

export type ArenaOpponentEligibilityRow = {
  email: string | null | undefined;
  bannedUntil: Date | string | null;
};

/** 현재 제재 중이거나 운영용인 계정을 실유저 아레나 상대 후보에서 제외한다. */
export function filterArenaOpponentEligibleRows<
  T extends ArenaOpponentEligibilityRow,
>(rows: readonly T[], now: Date = new Date()): T[] {
  return excludeArenaOperatorAccounts(filterRankingEligibleRows(rows, now));
}
