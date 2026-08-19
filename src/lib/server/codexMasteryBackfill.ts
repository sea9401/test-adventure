import {
  applyCodexMasteryMutation,
  emptyCodexMasteryProgress,
} from "@/adventure/data/v2/codexMastery";
import {
  CODEX_MASTERY_CATALOG,
  CODEX_MASTERY_MONSTER_NAME_TO_ENTRY_ID,
} from "@/adventure/data/v2/codexMasteryProductionCatalog";
import type {
  CodexMasteryCategory,
  CodexMasteryProgress,
  CodexMasteryStage,
} from "@/adventure/data/v2/codexMasteryTypes";
import { parseEquipmentCodex } from "@/adventure/data/v2/equipmentCodex";
import { parseProficiency } from "@/adventure/data/v2/proficiency";
import { V2_JOB_LIST, cumLevelForJob } from "@/adventure/data/v2/v2JobCatalog";
import { parseCookingState } from "@/adventure/v2/cooking";
import { parseFishCodex } from "@/adventure/v2/fishingCodex";
import {
  LIFE_FIELD_RECORD_CATALOG,
  parseLifeFieldRecordsState,
} from "@/adventure/v2/lifeFieldRecords";

export const CODEX_MASTERY_BACKFILL_KEY = "codex-mastery-backfill.v1";
export const CODEX_MASTERY_BACKFILL_VERSION = 1;

export type CodexMasteryBackfillSource = {
  fishingCodex?: unknown;
  adventureLog?: unknown;
  equipmentCodex?: unknown;
  cooking?: unknown;
  lifeFieldRecords?: unknown;
  proficiency?: unknown;
};

export type CodexMasteryBackfillTarget = {
  category: CodexMasteryCategory;
  entryId: string;
  targetCount: number;
  discovered: boolean;
  bestValue?: number;
};

export type CodexMasteryBackfillPreviewEntry = CodexMasteryBackfillTarget & {
  previousCount: number;
  nextCount: number;
  previousBestValue: number | null;
  nextBestValue: number | null;
  newStages: CodexMasteryStage[];
  scoreDeltaMilli: number;
  changed: boolean;
};

export type CodexMasteryBackfillPreview = {
  entries: CodexMasteryBackfillPreviewEntry[];
  changedEntries: number;
  scoreDeltaMilli: number;
  stageCounts: Record<CodexMasteryStage, number>;
};

function safeCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.floor(value));
}

function targetKey(target: Pick<CodexMasteryBackfillTarget, "category" | "entryId">) {
  return `${target.category}:${target.entryId}`;
}

function targetOrder(
  left: CodexMasteryBackfillTarget,
  right: CodexMasteryBackfillTarget,
): number {
  return left.category.localeCompare(right.category) ||
    left.entryId.localeCompare(right.entryId);
}

export function deriveCodexMasteryBackfillTargets(
  source: CodexMasteryBackfillSource,
): CodexMasteryBackfillTarget[] {
  const targets = new Map<string, CodexMasteryBackfillTarget>();
  const add = (target: CodexMasteryBackfillTarget) => {
    if (!CODEX_MASTERY_CATALOG.get(target.category, target.entryId)) return;
    const key = targetKey(target);
    const previous = targets.get(key);
    targets.set(key, previous
      ? {
          ...previous,
          targetCount: Math.max(previous.targetCount, target.targetCount),
          discovered: previous.discovered || target.discovered,
          bestValue:
            previous.bestValue === undefined
              ? target.bestValue
              : target.bestValue === undefined
                ? previous.bestValue
                : Math.max(previous.bestValue, target.bestValue),
        }
      : target);
  };

  const fish = parseFishCodex(source.fishingCodex);
  for (const [entryId, entry] of Object.entries(fish.fish)) {
    if (!entry.registered && !entry.caughtEver) continue;
    add({
      category: "fish",
      entryId,
      targetCount: entry.caughtEver ? safeCount(entry.totalCaught) : 0,
      discovered: true,
      ...(entry.caughtEver && entry.bestSize > 0 ? { bestValue: entry.bestSize } : {}),
    });
  }

  const adventureLog = source.adventureLog && typeof source.adventureLog === "object"
    ? source.adventureLog as { monsters?: unknown }
    : {};
  const monsters = adventureLog.monsters && typeof adventureLog.monsters === "object"
    ? adventureLog.monsters as Record<string, unknown>
    : {};
  for (const [legacyName, raw] of Object.entries(monsters)) {
    const entryId = CODEX_MASTERY_MONSTER_NAME_TO_ENTRY_ID.get(legacyName);
    if (!entryId || !raw || typeof raw !== "object") continue;
    const value = raw as { kills?: unknown; encountered?: unknown };
    const targetCount = safeCount(value.kills);
    if (targetCount <= 0 && value.encountered !== true) continue;
    add({
      category: "monster",
      entryId,
      targetCount,
      discovered: true,
    });
  }

  for (const entryId of parseEquipmentCodex(source.equipmentCodex).registeredIds) {
    add({ category: "equipment", entryId, targetCount: 0, discovered: true });
  }

  for (const entryId of parseCookingState(source.cooking, 0).discoveredRecipeIds) {
    add({ category: "cooking", entryId, targetCount: 0, discovered: true });
  }

  const life = parseLifeFieldRecordsState(source.lifeFieldRecords);
  const lifeDefinitions = new Map(
    LIFE_FIELD_RECORD_CATALOG.map((entry) => [entry.id, entry]),
  );
  for (const [entryId, record] of Object.entries(life.records)) {
    const definition = lifeDefinitions.get(entryId);
    if (!definition) continue;
    add({
      category: "life",
      entryId,
      targetCount: definition.kind === "environment" ? 0 : safeCount(record.count),
      discovered: true,
    });
  }

  const proficiency = parseProficiency(source.proficiency);
  for (const job of V2_JOB_LIST) {
    if (job.tier <= 0) continue;
    const targetCount = safeCount(cumLevelForJob(proficiency, job));
    if (targetCount <= 0) continue;
    add({
      category: "job",
      entryId: job.id,
      targetCount,
      discovered: true,
    });
  }

  return [...targets.values()].sort(targetOrder);
}

function progressChanged(
  previous: CodexMasteryProgress,
  next: CodexMasteryProgress,
): boolean {
  return previous.count !== next.count ||
    previous.bestValue !== next.bestValue ||
    previous.currentTier !== next.currentTier ||
    previous.scoreMilli !== next.scoreMilli ||
    previous.sealIds.join("\0") !== next.sealIds.join("\0") ||
    JSON.stringify(previous.tierAchievedAt) !== JSON.stringify(next.tierAchievedAt);
}

export function previewCodexMasteryBackfill(
  targets: readonly CodexMasteryBackfillTarget[],
  existingProgress: readonly CodexMasteryProgress[],
  now: Date,
): CodexMasteryBackfillPreview {
  const existing = new Map(existingProgress.map((progress) => [
    `${progress.category}:${progress.entryId}`,
    progress,
  ]));
  const stageCounts = Object.fromEntries(
    ["discovered", "bronze", "silver", "gold", "platinum", "diamond", "legendary"]
      .map((stage) => [stage, 0]),
  ) as Record<CodexMasteryStage, number>;
  let changedEntries = 0;
  let scoreDeltaMilli = 0;

  const entries = [...targets].sort(targetOrder).flatMap((target) => {
    const definition = CODEX_MASTERY_CATALOG.get(target.category, target.entryId);
    if (!definition) return [];
    const previous = existing.get(targetKey(target)) ??
      emptyCodexMasteryProgress(target.category, target.entryId);
    const transition = applyCodexMasteryMutation(definition, previous, {
      amount: Math.max(0, target.targetCount - previous.count),
      discovered: target.discovered,
      bestValue: target.bestValue,
    }, now);
    const changed = progressChanged(previous, transition.next);
    if (changed) changedEntries += 1;
    scoreDeltaMilli += transition.scoreDeltaMilli;
    for (const stage of transition.newStages) stageCounts[stage] += 1;
    return [{
      ...target,
      previousCount: previous.count,
      nextCount: transition.next.count,
      previousBestValue: previous.bestValue,
      nextBestValue: transition.next.bestValue,
      newStages: transition.newStages,
      scoreDeltaMilli: transition.scoreDeltaMilli,
      changed,
    }];
  });

  return { entries, changedEntries, scoreDeltaMilli, stageCounts };
}
