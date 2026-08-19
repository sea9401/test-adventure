import {
  CODEX_MASTERY_CATEGORIES,
  CODEX_MASTERY_POINT_UNITS,
  CODEX_MASTERY_STAGES,
  type CodexMasteryCategory,
  type CodexMasteryCountStage,
  type CodexMasteryEntryDefinition,
  type CodexMasteryMutation,
  type CodexMasteryProgress,
  type CodexMasteryStage,
  type CodexMasteryTier,
  type CodexMasteryTransition,
} from "./codexMasteryTypes";

const COUNT_STAGES: readonly CodexMasteryCountStage[] = [
  "bronze",
  "silver",
  "gold",
  "platinum",
  "diamond",
  "legendary",
];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isCategory(value: unknown): value is CodexMasteryCategory {
  return typeof value === "string" &&
    (CODEX_MASTERY_CATEGORIES as readonly string[]).includes(value);
}

function isStage(value: unknown): value is CodexMasteryStage {
  return typeof value === "string" &&
    (CODEX_MASTERY_STAGES as readonly string[]).includes(value);
}

function tierIndex(tier: CodexMasteryTier): number {
  if (tier === "none") return -1;
  return CODEX_MASTERY_STAGES.indexOf(tier);
}

/** Returns null for a valid definition, otherwise a stable human-readable error. */
export function validateCodexMasteryDefinition(
  definition: CodexMasteryEntryDefinition,
): string | null {
  if (!definition || typeof definition !== "object") return "definition is required";
  if (!isCategory(definition.category)) return "category is invalid";
  if (!isNonEmptyString(definition.entryId)) return "entryId must be non-empty";
  if (!Number.isSafeInteger(definition.scoreWeightMilli) || definition.scoreWeightMilli <= 0) {
    return "scoreWeightMilli must be a positive safe integer";
  }

  let previousThreshold = 0;
  for (const stage of COUNT_STAGES) {
    const threshold = definition.thresholds?.[stage];
    if (!Number.isSafeInteger(threshold) || threshold <= 0) {
      return `${stage} threshold must be a positive safe integer`;
    }
    if (threshold <= previousThreshold) return "thresholds must increase";
    previousThreshold = threshold;
  }

  if (!definition.seals || typeof definition.seals !== "object") {
    return "seals must be an object";
  }
  for (const [sealId, seal] of Object.entries(definition.seals)) {
    if (!isNonEmptyString(sealId)) return "seal IDs must be non-empty";
    if (seal?.pointUnits !== 2 && seal?.pointUnits !== 4) {
      return "seal point units must be 2 or 4";
    }
  }
  return null;
}

export function emptyCodexMasteryProgress(
  category: CodexMasteryCategory,
  entryId: string,
): CodexMasteryProgress {
  return {
    category,
    entryId,
    count: 0,
    bestValue: null,
    currentTier: "none",
    sealIds: [],
    tierAchievedAt: {},
    scoreMilli: 0,
  };
}

export function displayCodexMasteryScore(scoreMilli: number): number {
  return Math.round(Math.max(0, scoreMilli) / 1_000);
}

function assertValidMutation(
  definition: CodexMasteryEntryDefinition,
  previous: CodexMasteryProgress,
  mutation: CodexMasteryMutation,
  now: Date,
): void {
  if (!Number.isSafeInteger(mutation.amount) || mutation.amount < 0) {
    throw new Error("amount must be a non-negative safe integer");
  }
  if (mutation.discovered !== undefined && typeof mutation.discovered !== "boolean") {
    throw new Error("discovered must be a boolean");
  }
  if (
    mutation.bestValue !== undefined &&
    (!Number.isFinite(mutation.bestValue) || mutation.bestValue < 0)
  ) {
    throw new Error("bestValue must be finite and non-negative");
  }
  if (mutation.sealIds !== undefined && !Array.isArray(mutation.sealIds)) {
    throw new Error("sealIds must be an array");
  }
  for (const sealId of mutation.sealIds ?? []) {
    if (!isNonEmptyString(sealId) || definition.seals[sealId] === undefined) {
      throw new Error(`unknown seal: ${String(sealId)}`);
    }
  }
  if (previous.category !== definition.category || previous.entryId !== definition.entryId) {
    throw new Error("progress does not match definition");
  }
  if (!Number.isSafeInteger(previous.count) || previous.count < 0) {
    throw new Error("progress count must be a non-negative safe integer");
  }
  if (!Number.isSafeInteger(previous.scoreMilli) || previous.scoreMilli < 0) {
    throw new Error("progress score must be a non-negative safe integer");
  }
  if (previous.bestValue !== null &&
      (!Number.isFinite(previous.bestValue) || previous.bestValue < 0)) {
    throw new Error("progress bestValue must be finite and non-negative");
  }
  if (!isStage(previous.currentTier) && previous.currentTier !== "none") {
    throw new Error("progress tier is invalid");
  }
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new Error("now must be a valid date");
  }
}

export function applyCodexMasteryMutation(
  definition: CodexMasteryEntryDefinition,
  previous: CodexMasteryProgress,
  mutation: CodexMasteryMutation,
  now: Date = new Date(),
): CodexMasteryTransition {
  const definitionError = validateCodexMasteryDefinition(definition);
  if (definitionError) throw new Error(definitionError);
  assertValidMutation(definition, previous, mutation, now);

  const nextCount = previous.count + mutation.amount;
  if (!Number.isSafeInteger(nextCount)) {
    throw new Error("amount would overflow a safe integer");
  }

  const discovered =
    previous.currentTier !== "none" ||
    mutation.discovered === true ||
    mutation.amount > 0;
  const reached = CODEX_MASTERY_STAGES.filter((stage) =>
    stage === "discovered" ? discovered : nextCount >= definition.thresholds[stage],
  );
  const newStages = reached.filter((stage) => previous.tierAchievedAt[stage] == null);
  const timestamp = now.toISOString();
  const tierAchievedAt = { ...previous.tierAchievedAt };
  for (const stage of newStages) tierAchievedAt[stage] = timestamp;

  const reachedTier = reached.at(-1);
  const currentTier = reachedTier && tierIndex(reachedTier) > tierIndex(previous.currentTier)
    ? reachedTier
    : previous.currentTier;

  const nextSealIds = [...new Set(previous.sealIds)];
  const newSealIds: string[] = [];
  for (const sealId of mutation.sealIds ?? []) {
    if (!nextSealIds.includes(sealId)) {
      nextSealIds.push(sealId);
      newSealIds.push(sealId);
    }
  }

  const stagePointUnits = newStages.reduce(
    (sum, stage) => sum + CODEX_MASTERY_POINT_UNITS[stage],
    0,
  );
  const sealPointUnits = newSealIds.reduce(
    (sum, sealId) => sum + definition.seals[sealId].pointUnits,
    0,
  );
  const scoreDeltaMilli = (stagePointUnits + sealPointUnits) * definition.scoreWeightMilli;
  const nextScoreMilli = previous.scoreMilli + scoreDeltaMilli;
  if (!Number.isSafeInteger(nextScoreMilli)) {
    throw new Error("score would overflow a safe integer");
  }

  return {
    next: {
      ...previous,
      count: nextCount,
      bestValue:
        mutation.bestValue === undefined
          ? previous.bestValue
          : previous.bestValue === null
            ? mutation.bestValue
            : Math.max(previous.bestValue, mutation.bestValue),
      currentTier,
      sealIds: nextSealIds,
      tierAchievedAt,
      scoreMilli: nextScoreMilli,
    },
    newStages,
    newSealIds,
    scoreDeltaMilli,
  };
}
