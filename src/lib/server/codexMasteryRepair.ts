import { asc, eq, gt } from "drizzle-orm";
import {
  CODEX_MASTERY_CATEGORIES,
  CODEX_MASTERY_STAGES,
  type CodexMasteryCountStage,
  type CodexMasteryProgress,
  type CodexMasteryTier,
} from "@/adventure/data/v2/codexMasteryTypes";
import { codexMasteryProgress, codexMasterySummary } from "@/db/schema";
import type { DbExecutor, DbTransactionExecutor } from "./savesKv";
import {
  codexMasteryRowToProgress,
  emptyCodexMasterySummary,
  type CodexMasterySummaryState,
} from "./codexMasteryRepository";

export type CodexMasteryRepairProgressRow = CodexMasteryProgress & {
  updatedAt: Date | null;
};

export type CodexMasteryRepairStore = {
  readSummary(
    userId: string,
    now: Date,
  ): Promise<CodexMasterySummaryState | CodexMasteryRepairSummarySnapshot>;
  readProgress(userId: string): Promise<CodexMasteryRepairProgressRow[]>;
  saveSummary(
    userId: string,
    summary: CodexMasterySummaryState,
    now: Date,
  ): Promise<void>;
};

export type CodexMasteryRepairSummarySnapshot = {
  summary: CodexMasterySummaryState;
  exists: boolean;
  created: boolean;
};

export type CodexMasteryRepairDatabase = DbExecutor & {
  transaction<T>(callback: (tx: DbTransactionExecutor) => Promise<T>): Promise<T>;
};

export type CodexMasterySummaryDifference = {
  before: number | Date | null;
  after: number | Date | null;
};

const COUNT_STAGES: readonly CodexMasteryCountStage[] = [
  "bronze",
  "silver",
  "gold",
  "platinum",
  "diamond",
  "legendary",
];

function tierIndex(tier: CodexMasteryTier): number {
  return tier === "none" ? -1 : CODEX_MASTERY_STAGES.indexOf(tier);
}

function safeAdd(value: number, delta: number): number {
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    !Number.isSafeInteger(delta) ||
    delta < 0
  ) {
    throw new Error("codex mastery summary rebuild requires non-negative safe integers");
  }
  const result = value + delta;
  if (!Number.isSafeInteger(result)) {
    throw new Error("codex mastery summary rebuild would overflow a safe integer");
  }
  return result;
}

function rawRepairNumber(value: unknown): number {
  // Keep even negative/unsafe numeric DB values so compare can see and repair them.
  // Non-numeric driver output becomes NaN, which also differs from every rebuilt value.
  return typeof value === "number" ? value : Number.NaN;
}

function codexMasterySummaryRowToRepairState(
  row: typeof codexMasterySummary.$inferSelect,
): CodexMasterySummaryState {
  return {
    totalScoreMilli: rawRepairNumber(row.totalScoreMilli),
    categoryScoreMilli: {
      equipment: rawRepairNumber(row.equipmentScoreMilli),
      fish: rawRepairNumber(row.fishScoreMilli),
      monster: rawRepairNumber(row.monsterScoreMilli),
      cooking: rawRepairNumber(row.cookingScoreMilli),
      life: rawRepairNumber(row.lifeScoreMilli),
      job: rawRepairNumber(row.jobScoreMilli),
    },
    stageCounts: {
      bronze: rawRepairNumber(row.bronzeCount),
      silver: rawRepairNumber(row.silverCount),
      gold: rawRepairNumber(row.goldCount),
      platinum: rawRepairNumber(row.platinumCount),
      diamond: rawRepairNumber(row.diamondCount),
      legendary: rawRepairNumber(row.legendaryCount),
    },
    sealCount: rawRepairNumber(row.sealCount),
    scoredCategoryCount: rawRepairNumber(row.scoredCategoryCount),
    scoreReachedAt: row.scoreReachedAt instanceof Date
      ? new Date(row.scoreReachedAt.getTime())
      : null,
    categoryScoreReachedAt: {
      equipment: row.equipmentScoreReachedAt instanceof Date
        ? new Date(row.equipmentScoreReachedAt.getTime())
        : null,
      fish: row.fishScoreReachedAt instanceof Date
        ? new Date(row.fishScoreReachedAt.getTime())
        : null,
      monster: row.monsterScoreReachedAt instanceof Date
        ? new Date(row.monsterScoreReachedAt.getTime())
        : null,
      cooking: row.cookingScoreReachedAt instanceof Date
        ? new Date(row.cookingScoreReachedAt.getTime())
        : null,
      life: row.lifeScoreReachedAt instanceof Date
        ? new Date(row.lifeScoreReachedAt.getTime())
        : null,
      job: row.jobScoreReachedAt instanceof Date
        ? new Date(row.jobScoreReachedAt.getTime())
        : null,
    },
  };
}

function validUpdatedAt(value: Date | null): Date | null {
  return value instanceof Date && !Number.isNaN(value.getTime())
    ? new Date(value.getTime())
    : null;
}

function countDistinctRowSeals(sealIds: readonly string[]): number {
  return new Set(sealIds.filter((sealId) =>
    typeof sealId === "string" && sealId.trim().length > 0,
  )).size;
}

/** Rebuilds a user summary solely from its persisted per-entry progress rows. */
export function aggregateCodexMasterySummary(
  rows: readonly CodexMasteryRepairProgressRow[],
): CodexMasterySummaryState {
  const summary = emptyCodexMasterySummary();
  let latestUpdatedAt: Date | null = null;
  const latestCategoryUpdatedAt = Object.fromEntries(
    CODEX_MASTERY_CATEGORIES.map((category) => [category, null]),
  ) as Record<(typeof CODEX_MASTERY_CATEGORIES)[number], Date | null>;

  for (const row of rows) {
    summary.totalScoreMilli = safeAdd(summary.totalScoreMilli, row.scoreMilli);
    summary.categoryScoreMilli[row.category] = safeAdd(
      summary.categoryScoreMilli[row.category],
      row.scoreMilli,
    );
    summary.sealCount = safeAdd(summary.sealCount, countDistinctRowSeals(row.sealIds));

    const currentTierIndex = tierIndex(row.currentTier);
    for (const stage of COUNT_STAGES) {
      if (currentTierIndex >= tierIndex(stage)) {
        summary.stageCounts[stage] = safeAdd(summary.stageCounts[stage], 1);
      }
    }

    const updatedAt = validUpdatedAt(row.updatedAt);
    if (row.scoreMilli > 0 && updatedAt) {
      if (!latestUpdatedAt || updatedAt > latestUpdatedAt) {
        latestUpdatedAt = new Date(updatedAt.getTime());
      }
      const categoryUpdatedAt = latestCategoryUpdatedAt[row.category];
      if (!categoryUpdatedAt || updatedAt > categoryUpdatedAt) {
        latestCategoryUpdatedAt[row.category] = new Date(updatedAt.getTime());
      }
    }
  }

  summary.scoredCategoryCount = CODEX_MASTERY_CATEGORIES.filter(
    (category) => summary.categoryScoreMilli[category] > 0,
  ).length;
  summary.scoreReachedAt = summary.totalScoreMilli > 0 ? latestUpdatedAt : null;
  for (const category of CODEX_MASTERY_CATEGORIES) {
    summary.categoryScoreReachedAt[category] =
      summary.categoryScoreMilli[category] > 0
        ? latestCategoryUpdatedAt[category]
        : null;
  }
  return summary;
}

function valuesEqual(
  before: number | Date | null,
  after: number | Date | null,
): boolean {
  if (before instanceof Date && after instanceof Date) {
    return before.getTime() === after.getTime();
  }
  return before === after;
}

export function compareCodexMasterySummary(
  before: CodexMasterySummaryState,
  after: CodexMasterySummaryState,
): Record<string, CodexMasterySummaryDifference> {
  const differences: Record<string, CodexMasterySummaryDifference> = {};
  const addDifference = (
    key: string,
    previous: number | Date | null,
    next: number | Date | null,
  ) => {
    if (!valuesEqual(previous, next)) differences[key] = { before: previous, after: next };
  };

  addDifference("totalScoreMilli", before.totalScoreMilli, after.totalScoreMilli);
  for (const category of CODEX_MASTERY_CATEGORIES) {
    addDifference(
      `categoryScoreMilli.${category}`,
      before.categoryScoreMilli[category],
      after.categoryScoreMilli[category],
    );
  }
  for (const stage of COUNT_STAGES) {
    addDifference(
      `stageCounts.${stage}`,
      before.stageCounts[stage],
      after.stageCounts[stage],
    );
  }
  addDifference("sealCount", before.sealCount, after.sealCount);
  addDifference(
    "scoredCategoryCount",
    before.scoredCategoryCount,
    after.scoredCategoryCount,
  );
  addDifference("scoreReachedAt", before.scoreReachedAt, after.scoreReachedAt);
  for (const category of CODEX_MASTERY_CATEGORIES) {
    addDifference(
      `categoryScoreReachedAt.${category}`,
      before.categoryScoreReachedAt[category],
      after.categoryScoreReachedAt[category],
    );
  }
  return differences;
}

function preserveExactScoreReachTimes(
  before: CodexMasterySummaryState,
  rebuilt: CodexMasterySummaryState,
): CodexMasterySummaryState {
  const preserved: CodexMasterySummaryState = {
    ...rebuilt,
    categoryScoreMilli: { ...rebuilt.categoryScoreMilli },
    stageCounts: { ...rebuilt.stageCounts },
    scoreReachedAt: rebuilt.scoreReachedAt
      ? new Date(rebuilt.scoreReachedAt.getTime())
      : null,
    categoryScoreReachedAt: Object.fromEntries(
      CODEX_MASTERY_CATEGORIES.map((category) => [
        category,
        rebuilt.categoryScoreReachedAt[category]
          ? new Date(rebuilt.categoryScoreReachedAt[category]!.getTime())
          : null,
      ]),
    ) as CodexMasterySummaryState["categoryScoreReachedAt"],
  };
  if (
    rebuilt.totalScoreMilli > 0 &&
    rebuilt.totalScoreMilli === before.totalScoreMilli &&
    validUpdatedAt(before.scoreReachedAt)
  ) {
    preserved.scoreReachedAt = new Date(before.scoreReachedAt!.getTime());
  }
  for (const category of CODEX_MASTERY_CATEGORIES) {
    const exact = validUpdatedAt(before.categoryScoreReachedAt[category]);
    if (
      rebuilt.categoryScoreMilli[category] > 0 &&
      rebuilt.categoryScoreMilli[category] === before.categoryScoreMilli[category] &&
      exact
    ) {
      preserved.categoryScoreReachedAt[category] = new Date(exact.getTime());
    }
  }
  return preserved;
}

function summarySnapshot(
  value: CodexMasterySummaryState | CodexMasteryRepairSummarySnapshot,
): CodexMasteryRepairSummarySnapshot {
  return "summary" in value
    ? value
    : { summary: value, exists: true, created: false };
}

export async function repairCodexMasterySummary(
  store: CodexMasteryRepairStore,
  userId: string,
  options: { apply: boolean; now: Date },
): Promise<{
  changed: boolean;
  applied: boolean;
  created: boolean;
  before: CodexMasterySummaryState;
  after: CodexMasterySummaryState;
  differences: Record<string, CodexMasterySummaryDifference>;
}> {
  const snapshot = summarySnapshot(await store.readSummary(userId, options.now));
  const before = snapshot.summary;
  const after = preserveExactScoreReachTimes(
    before,
    aggregateCodexMasterySummary(await store.readProgress(userId)),
  );
  const differences = compareCodexMasterySummary(before, after);
  const valuesChanged = Object.keys(differences).length > 0;
  const changed = !snapshot.exists || valuesChanged;
  if (options.apply && valuesChanged) {
    await store.saveSummary(userId, after, options.now);
  }
  return {
    changed,
    applied: options.apply && changed,
    created: options.apply && snapshot.created,
    before,
    after,
    differences,
  };
}

export async function repairCodexMasterySummaryWithDatabase(
  database: CodexMasteryRepairDatabase,
  userId: string,
  options: { apply: boolean; now: Date },
): ReturnType<typeof repairCodexMasterySummary> {
  if (!options.apply) {
    return repairCodexMasterySummary(
      createDrizzleCodexMasteryRepairStore(database),
      userId,
      options,
    );
  }

  return database.transaction(async (tx) => repairCodexMasterySummary(
    createDrizzleCodexMasteryRepairStore(tx, { lockSummary: true }),
    userId,
    options,
  ));
}

export async function listCodexMasterySummaryUserIds(
  executor: DbExecutor,
  options: { afterUserId?: string; limit: number },
): Promise<string[]> {
  const summaryRows = options.afterUserId
    ? await executor
      .select({ userId: codexMasterySummary.userId })
      .from(codexMasterySummary)
      .where(gt(codexMasterySummary.userId, options.afterUserId))
      .orderBy(asc(codexMasterySummary.userId))
      .limit(options.limit)
    : await executor
      .select({ userId: codexMasterySummary.userId })
      .from(codexMasterySummary)
      .orderBy(asc(codexMasterySummary.userId))
      .limit(options.limit);
  const progressRows = options.afterUserId
    ? await executor
      .selectDistinct({ userId: codexMasteryProgress.userId })
      .from(codexMasteryProgress)
      .where(gt(codexMasteryProgress.userId, options.afterUserId))
      .orderBy(asc(codexMasteryProgress.userId))
      .limit(options.limit)
    : await executor
      .selectDistinct({ userId: codexMasteryProgress.userId })
      .from(codexMasteryProgress)
      .orderBy(asc(codexMasteryProgress.userId))
      .limit(options.limit);
  return [...new Set([
    ...summaryRows.map((row) => row.userId),
    ...progressRows.map((row) => row.userId),
  ])]
    .sort((left, right) => left < right ? -1 : left > right ? 1 : 0)
    .slice(0, options.limit);
}

function emptyCodexMasterySummaryRow(userId: string, now: Date) {
  return {
    userId,
    totalScoreMilli: 0,
    equipmentScoreMilli: 0,
    fishScoreMilli: 0,
    monsterScoreMilli: 0,
    cookingScoreMilli: 0,
    lifeScoreMilli: 0,
    jobScoreMilli: 0,
    bronzeCount: 0,
    silverCount: 0,
    goldCount: 0,
    platinumCount: 0,
    diamondCount: 0,
    legendaryCount: 0,
    sealCount: 0,
    scoredCategoryCount: 0,
    scoreReachedAt: null,
    equipmentScoreReachedAt: null,
    fishScoreReachedAt: null,
    monsterScoreReachedAt: null,
    cookingScoreReachedAt: null,
    lifeScoreReachedAt: null,
    jobScoreReachedAt: null,
    updatedAt: now,
  };
}

export function createDrizzleCodexMasteryRepairStore(
  executor: DbExecutor,
  options: { lockSummary?: boolean } = {},
): CodexMasteryRepairStore {
  return {
    async readSummary(userId, now) {
      const readRow = async () => {
        const query = executor
          .select()
          .from(codexMasterySummary)
          .where(eq(codexMasterySummary.userId, userId));
        const rows = options.lockSummary
          ? await query.for("update").limit(1)
          : await query.limit(1);
        return rows[0];
      };
      let row = await readRow();
      let created = false;
      if (!row && options.lockSummary) {
        const inserted = await executor
          .insert(codexMasterySummary)
          .values(emptyCodexMasterySummaryRow(userId, now))
          .onConflictDoNothing()
          .returning({ userId: codexMasterySummary.userId });
        created = inserted.length === 1;
        row = await readRow();
        if (!row) throw new Error("codex mastery summary row could not be locked");
      }
      return {
        summary: row
          ? codexMasterySummaryRowToRepairState(row)
          : emptyCodexMasterySummary(),
        exists: row != null && !created,
        created,
      };
    },
    async readProgress(userId) {
      const rows = await executor
        .select()
        .from(codexMasteryProgress)
        .where(eq(codexMasteryProgress.userId, userId));
      return rows.map((row) => ({
        ...codexMasteryRowToProgress(row),
        updatedAt: validUpdatedAt(row.updatedAt),
      }));
    },
    async saveSummary(userId, summary, now) {
      const saved = await executor
        .update(codexMasterySummary)
        .set({
          totalScoreMilli: summary.totalScoreMilli,
          equipmentScoreMilli: summary.categoryScoreMilli.equipment,
          fishScoreMilli: summary.categoryScoreMilli.fish,
          monsterScoreMilli: summary.categoryScoreMilli.monster,
          cookingScoreMilli: summary.categoryScoreMilli.cooking,
          lifeScoreMilli: summary.categoryScoreMilli.life,
          jobScoreMilli: summary.categoryScoreMilli.job,
          bronzeCount: summary.stageCounts.bronze,
          silverCount: summary.stageCounts.silver,
          goldCount: summary.stageCounts.gold,
          platinumCount: summary.stageCounts.platinum,
          diamondCount: summary.stageCounts.diamond,
          legendaryCount: summary.stageCounts.legendary,
          sealCount: summary.sealCount,
          scoredCategoryCount: summary.scoredCategoryCount,
          scoreReachedAt: summary.scoreReachedAt,
          equipmentScoreReachedAt: summary.categoryScoreReachedAt.equipment,
          fishScoreReachedAt: summary.categoryScoreReachedAt.fish,
          monsterScoreReachedAt: summary.categoryScoreReachedAt.monster,
          cookingScoreReachedAt: summary.categoryScoreReachedAt.cooking,
          lifeScoreReachedAt: summary.categoryScoreReachedAt.life,
          jobScoreReachedAt: summary.categoryScoreReachedAt.job,
          updatedAt: now,
        })
        .where(eq(codexMasterySummary.userId, userId))
        .returning({ userId: codexMasterySummary.userId });
      if (saved.length !== 1) {
        throw new Error("codex mastery summary row was not saved");
      }
    },
  };
}
