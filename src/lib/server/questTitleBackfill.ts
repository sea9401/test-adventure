import { V2_QUESTS } from "@/adventure/data/v2/v2Quests";
import { db } from "@/db";
import { grantTitleIfMissingInTx, ownedTitleIdsOf } from "@/lib/server/grantTitle";
import type { DbExecutor } from "@/lib/server/savesKv";

type AdventureLogShape = {
  titles?: Record<string, { obtainedAt: number }>;
  [key: string]: unknown;
};

export function missingClaimedQuestTitleRewards(
  claimed: ReadonlySet<string>,
  advLogRaw: unknown,
): string[] {
  const owned = new Set(ownedTitleIdsOf(advLogRaw));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const quest of V2_QUESTS) {
    const titleId = quest.reward.titleId;
    if (!titleId || !claimed.has(quest.id) || owned.has(titleId) || seen.has(titleId)) {
      continue;
    }
    seen.add(titleId);
    out.push(titleId);
  }
  return out;
}

export function addTitlesToAdventureLog(
  advLogRaw: unknown,
  titleIds: readonly string[],
  obtainedAt: number,
): AdventureLogShape {
  const current =
    advLogRaw && typeof advLogRaw === "object" && !Array.isArray(advLogRaw)
      ? (advLogRaw as AdventureLogShape)
      : {};
  const titles = {
    ...(current.titles && typeof current.titles === "object" ? current.titles : {}),
  };
  for (const titleId of titleIds) {
    if (!titles[titleId]) titles[titleId] = { obtainedAt };
  }
  return { ...current, titles };
}

export async function backfillClaimedQuestTitleRewardsInTx(
  tx: DbExecutor,
  userId: string,
  claimed: ReadonlySet<string>,
  advLogRaw: unknown,
  obtainedAt: number = Date.now(),
): Promise<string[]> {
  const missing = missingClaimedQuestTitleRewards(claimed, advLogRaw);
  const granted: string[] = [];
  for (const titleId of missing) {
    if (await grantTitleIfMissingInTx(tx, userId, titleId, obtainedAt)) {
      granted.push(titleId);
    }
  }
  return granted;
}

export async function backfillClaimedQuestTitleRewards(
  userId: string,
  claimed: ReadonlySet<string>,
  advLogRaw: unknown,
  obtainedAt: number = Date.now(),
): Promise<string[]> {
  const missing = missingClaimedQuestTitleRewards(claimed, advLogRaw);
  if (missing.length === 0) return [];
  return db.transaction(async (tx) => {
    const granted: string[] = [];
    for (const titleId of missing) {
      if (await grantTitleIfMissingInTx(tx, userId, titleId, obtainedAt)) {
        granted.push(titleId);
      }
    }
    return granted;
  });
}
