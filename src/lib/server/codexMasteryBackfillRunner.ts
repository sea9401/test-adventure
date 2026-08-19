import { and, asc, gt, inArray } from "drizzle-orm";
import type { db } from "@/db";
import { savesKv } from "@/db/schema";
import { CODEX_MASTERY_CATALOG } from "@/adventure/data/v2/codexMasteryProductionCatalog";
import type { CodexMasteryProgress } from "@/adventure/data/v2/codexMasteryTypes";
import { COOKING_SAVE_KEY } from "@/adventure/v2/cooking";
import { FISHING_CODEX_KEY } from "@/adventure/v2/fishingCodex";
import { LIFE_FIELD_RECORDS_KEY } from "@/adventure/v2/lifeFieldRecords";
import { EQUIPMENT_CODEX_KEY } from "@/adventure/data/v2/equipmentCodex";
import { readCodexMasteryProgressRows } from "./codexMasteryRepository";
import { syncCodexMasteryTarget } from "./codexMasteryService";
import {
  lockSaveForUpdate,
  readSave,
  upsertSave,
  type DbExecutor,
  type DbTransactionExecutor,
} from "./savesKv";
import {
  CODEX_MASTERY_BACKFILL_KEY,
  CODEX_MASTERY_BACKFILL_VERSION,
  deriveCodexMasteryBackfillTargets,
  previewCodexMasteryBackfill,
  type CodexMasteryBackfillSource,
  type CodexMasteryBackfillTarget,
} from "./codexMasteryBackfill";

const SOURCE_KEYS = [
  FISHING_CODEX_KEY,
  "adventure-log.v2",
  EQUIPMENT_CODEX_KEY,
  COOKING_SAVE_KEY,
  LIFE_FIELD_RECORDS_KEY,
  "proficiency.v2",
] as const;

type Marker = { version?: unknown };
export type CodexMasteryBackfillRunResult = {
  skipped: boolean;
  applied: boolean;
  targets: number;
  changedEntries: number;
  scoreDeltaMilli: number;
};

export type CodexMasteryBackfillRunnerRuntime<
  ReadExecutor,
  WriteExecutor extends ReadExecutor = ReadExecutor,
> = {
  readExecutor: ReadExecutor;
  transaction<T>(run: (executor: WriteExecutor) => Promise<T>): Promise<T>;
  readMarker(executor: ReadExecutor, userId: string, lock: boolean): Promise<Marker>;
  readSource(executor: ReadExecutor, userId: string, lock: boolean): Promise<CodexMasteryBackfillSource>;
  readProgress(executor: ReadExecutor, userId: string): Promise<CodexMasteryProgress[]>;
  syncTarget(
    executor: WriteExecutor,
    userId: string,
    target: CodexMasteryBackfillTarget,
    now: Date,
  ): Promise<{ recorded: boolean; scoreDeltaMilli?: number }>;
  writeMarker(executor: WriteExecutor, userId: string, now: Date): Promise<void>;
};

function markerComplete(marker: Marker): boolean {
  return Number(marker.version) >= CODEX_MASTERY_BACKFILL_VERSION;
}

async function readBackfillPlan<ReadExecutor, WriteExecutor extends ReadExecutor>(
  runtime: CodexMasteryBackfillRunnerRuntime<ReadExecutor, WriteExecutor>,
  executor: ReadExecutor,
  userId: string,
  options: { lock: boolean; now: Date },
) {
  const marker = await runtime.readMarker(executor, userId, options.lock);
  if (markerComplete(marker)) {
    return undefined;
  }
  const source = await runtime.readSource(executor, userId, options.lock);
  const progress = await runtime.readProgress(executor, userId);
  const targets = deriveCodexMasteryBackfillTargets(source);
  const preview = previewCodexMasteryBackfill(targets, progress, options.now);
  return { targets, preview };
}

const SKIPPED_RESULT: CodexMasteryBackfillRunResult = {
  skipped: true,
  applied: false,
  targets: 0,
  changedEntries: 0,
  scoreDeltaMilli: 0,
};

function resultFromPlan(
  plan: NonNullable<Awaited<ReturnType<typeof readBackfillPlan>>>,
  applied: boolean,
): CodexMasteryBackfillRunResult {
  return {
    skipped: false,
    applied,
    targets: plan.targets.length,
    changedEntries: plan.preview.changedEntries,
    scoreDeltaMilli: plan.preview.scoreDeltaMilli,
  };
}

export async function runCodexMasteryBackfillUserWithRuntime<
  ReadExecutor,
  WriteExecutor extends ReadExecutor = ReadExecutor,
>(
  runtime: CodexMasteryBackfillRunnerRuntime<ReadExecutor, WriteExecutor>,
  userId: string,
  options: { apply: boolean; now: Date },
): Promise<CodexMasteryBackfillRunResult> {
  if (!options.apply) {
    const plan = await readBackfillPlan(runtime, runtime.readExecutor, userId, {
      lock: false,
      now: options.now,
    });
    return plan ? resultFromPlan(plan, false) : SKIPPED_RESULT;
  }
  return runtime.transaction(async (executor) => {
    const plan = await readBackfillPlan(runtime, executor, userId, {
      lock: true,
      now: options.now,
    });
    if (!plan) return SKIPPED_RESULT;
    for (const target of plan.targets) {
      await runtime.syncTarget(executor, userId, target, options.now);
    }
    await runtime.writeMarker(executor, userId, options.now);
    return resultFromPlan(plan, true);
  });
}

function drizzleRuntime(database: typeof db): CodexMasteryBackfillRunnerRuntime<
  DbExecutor,
  DbTransactionExecutor
> {
  const valueFor = async (
    executor: DbExecutor,
    userId: string,
    key: string,
    lock: boolean,
  ) => lock
    ? lockSaveForUpdate(executor, userId, key, {})
    : readSave(executor, userId, key, {});
  return {
    readExecutor: database,
    transaction: (run) => database.transaction(run),
    readMarker: (executor, userId, lock) =>
      valueFor(executor, userId, CODEX_MASTERY_BACKFILL_KEY, lock),
    async readSource(executor, userId, lock) {
      const values: unknown[] = [];
      for (const key of SOURCE_KEYS) values.push(await valueFor(executor, userId, key, lock));
      return {
        fishingCodex: values[0],
        adventureLog: values[1],
        equipmentCodex: values[2],
        cooking: values[3],
        lifeFieldRecords: values[4],
        proficiency: values[5],
      };
    },
    readProgress: readCodexMasteryProgressRows,
    syncTarget: (executor, userId, target, now) => syncCodexMasteryTarget(
      executor,
      CODEX_MASTERY_CATALOG,
      {
        userId,
        category: target.category,
        entryId: target.entryId,
        target: {
          count: target.targetCount,
          discovered: target.discovered,
          bestValue: target.bestValue,
        },
        source: "codex.backfill.v1",
      },
      { recordingEnabled: true, sealsEnabled: false },
      now,
    ),
    writeMarker: (executor, userId, now) => upsertSave(
      executor,
      userId,
      CODEX_MASTERY_BACKFILL_KEY,
      { version: CODEX_MASTERY_BACKFILL_VERSION, completedAt: now.toISOString() },
    ),
  };
}

export async function backfillCodexMasteryUser(
  database: typeof db,
  userId: string,
  options: { apply: boolean; now: Date },
): Promise<CodexMasteryBackfillRunResult> {
  return runCodexMasteryBackfillUserWithRuntime(
    drizzleRuntime(database),
    userId,
    options,
  );
}

export function previewCodexMasteryBackfillUser(
  database: typeof db,
  userId: string,
  now: Date,
): Promise<CodexMasteryBackfillRunResult> {
  return backfillCodexMasteryUser(database, userId, { apply: false, now });
}

export function applyCodexMasteryBackfillUser(
  database: typeof db,
  userId: string,
  now: Date,
): Promise<CodexMasteryBackfillRunResult> {
  return backfillCodexMasteryUser(database, userId, { apply: true, now });
}

export async function listCodexMasteryBackfillUserIds(
  database: typeof db,
  options: { afterUserId?: string; limit: number },
): Promise<string[]> {
  const query = database
    .selectDistinct({ userId: savesKv.userId })
    .from(savesKv)
    .where(options.afterUserId
      ? and(inArray(savesKv.key, [...SOURCE_KEYS]), gt(savesKv.userId, options.afterUserId))
      : inArray(savesKv.key, [...SOURCE_KEYS]));
  const rows = await query.orderBy(asc(savesKv.userId)).limit(options.limit);
  return rows.map((row) => row.userId);
}
