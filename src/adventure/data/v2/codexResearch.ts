import {
  CODEX_MASTERY_CATEGORIES,
  type CodexMasteryCategory,
} from "./codexMasteryTypes";

export const CODEX_RESEARCH_GROUP_COUNTS = {
  basic: 6,
  field: 6,
  expert: 4,
  challenge: 2,
} as const;

export const CODEX_RESEARCH_OBJECTIVE_COUNT = 18;
export const CODEX_RESEARCH_OBJECTIVE_SCORE = 12_000;
export const CODEX_RESEARCH_DIVERSITY_SCORE = 5_000;
export const CODEX_RESEARCH_RECORD_SCORE = 3_000;
export const CODEX_RESEARCH_MAX_SCORE = 20_000;

export const CODEX_RESEARCH_SOURCES = {
  equipment: ["equipment.drop", "equipment.craft"],
  fish: ["fishing.catch"],
  monster: ["hunt.victory"],
  cooking: ["cooking.complete"],
  life: ["life.complete"],
  job: ["job.victory", "job.activity", "job.training", "job.consumable"],
} as const satisfies Record<CodexMasteryCategory, readonly string[]>;

export type CodexResearchSource =
  (typeof CODEX_RESEARCH_SOURCES)[CodexMasteryCategory][number];
export type CodexResearchSeasonStatus =
  | "scheduled"
  | "active"
  | "settling"
  | "closed";
export type CodexResearchObjectiveGroup = keyof typeof CODEX_RESEARCH_GROUP_COUNTS;

export type CodexResearchFilter = {
  category: CodexMasteryCategory;
  entryIds?: string[];
  sources?: CodexResearchSource[];
};

export type CodexResearchObjectiveRule =
  | { kind: "count"; target: number }
  | { kind: "distinct_entries"; target: number }
  | { kind: "best_value"; target: number };

export type CodexResearchObjective = {
  id: string;
  group: CodexResearchObjectiveGroup;
  label: string;
  description: string;
  points: number;
  filter: CodexResearchFilter;
  rule: CodexResearchObjectiveRule;
};

export type CodexResearchDiversityTrack = {
  id: string;
  label: string;
  filter: CodexResearchFilter;
  pointsPerEntry: number;
  maxEntries: number;
};

export type CodexResearchRecordTrack = {
  id: string;
  label: string;
  filter: CodexResearchFilter;
  milestones: Array<{ value: number; score: number }>;
};

export type CodexResearchDefinitionSnapshot = {
  version: number;
  seasonId: string;
  themeId: string;
  themeName: string;
  primaryCategories: [CodexMasteryCategory, CodexMasteryCategory];
  supportCategory: CodexMasteryCategory;
  objectives: CodexResearchObjective[];
  diversityTracks: CodexResearchDiversityTrack[];
  recordTracks: CodexResearchRecordTrack[];
};

export type CodexResearchSeasonWindow = {
  startAt: Date;
  endAt: Date;
};

export type CodexResearchEvent = {
  category: CodexMasteryCategory;
  entryId: string;
  amount: number;
  source: CodexResearchSource;
  bestValue?: number;
};

export type CodexResearchObjectiveProgress = {
  value: number;
  seenEntryKeys?: string[];
  completedAt?: string;
};

export type CodexResearchProgressState = {
  objectives: Record<string, CodexResearchObjectiveProgress>;
  diversityEntries: Record<string, string[]>;
  recordValues: Record<string, number>;
};

export type CodexResearchRepresentativeRecord = {
  trackId: string;
  category: CodexMasteryCategory;
  entryId: string;
  value: number;
  recordedAt: string;
};

export type CodexResearchProgress = {
  score: number;
  objectiveProgress: CodexResearchProgressState;
  objectiveCompletedCount: number;
  diversityScore: number;
  recordScore: number;
  scoreReachedAt: string | null;
  representativeRecord: CodexResearchRepresentativeRecord | null;
};

export type CodexResearchObjectiveView = {
  id: string;
  group: CodexResearchObjectiveGroup;
  label: string;
  description: string;
  points: number;
  value: number;
  target: number;
  progressPercent: number;
  completedAt: string | null;
};

export type CodexResearchPersonalView =
  | { status: "no_season" }
  | {
      status: "active";
      seasonId: string;
      themeId: string;
      themeName: string;
      startAt: string;
      endAt: string;
      score: number;
      objectiveScore: number;
      diversityScore: number;
      recordScore: number;
      objectiveCompletedCount: number;
      objectiveCount: number;
      scoreReachedAt: string | null;
      representativeRecord: CodexResearchRepresentativeRecord | null;
      objectives: CodexResearchObjectiveView[];
    };

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isCategory(value: unknown): value is CodexMasteryCategory {
  return typeof value === "string" &&
    (CODEX_MASTERY_CATEGORIES as readonly string[]).includes(value);
}

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function safeSum(values: readonly number[]): number | null {
  let total = 0;
  for (const value of values) {
    if (!Number.isSafeInteger(value)) return null;
    total += value;
    if (!Number.isSafeInteger(total)) return null;
  }
  return total;
}

export function kstCodexResearchSeasonWindow(
  seasonId: string,
): CodexResearchSeasonWindow {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(seasonId);
  if (!match) throw new Error("seasonId must use YYYY-MM");
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (year < 2_000) throw new Error("season year must be at least 2000");
  return {
    startAt: new Date(Date.UTC(year, monthIndex, 1, -9)),
    endAt: new Date(Date.UTC(year, monthIndex + 1, 1, -9)),
  };
}

export function isCodexResearchSeasonOpen(
  window: CodexResearchSeasonWindow,
  now: Date,
): boolean {
  if (
    !(window.startAt instanceof Date) ||
    !(window.endAt instanceof Date) ||
    !(now instanceof Date) ||
    [window.startAt, window.endAt, now].some((value) => Number.isNaN(value.getTime()))
  ) {
    throw new Error("season window and now must be valid dates");
  }
  return window.startAt.getTime() <= now.getTime() &&
    now.getTime() < window.endAt.getTime();
}

function validateFilter(value: unknown): string | null {
  if (!isObject(value)) return "filter must be an object";
  if (!isCategory(value.category)) return "filter category is invalid";

  if (value.entryIds !== undefined) {
    if (
      !Array.isArray(value.entryIds) ||
      value.entryIds.length === 0 ||
      value.entryIds.some((entryId) => !isNonEmptyString(entryId)) ||
      new Set(value.entryIds).size !== value.entryIds.length
    ) {
      return "filter entryIds must be unique non-empty strings";
    }
  }
  if (value.sources !== undefined) {
    const allowed = CODEX_RESEARCH_SOURCES[value.category] as readonly string[];
    if (
      !Array.isArray(value.sources) ||
      value.sources.length === 0 ||
      value.sources.some((source) => !isNonEmptyString(source) || !allowed.includes(source)) ||
      new Set(value.sources).size !== value.sources.length
    ) {
      return "filter sources do not match category";
    }
  }
  return null;
}

function validateObjectiveRule(value: unknown): string | null {
  if (!isObject(value)) return "objective rule must be an object";
  if (
    value.kind !== "count" &&
    value.kind !== "distinct_entries" &&
    value.kind !== "best_value"
  ) {
    return "objective rule kind is invalid";
  }
  if (value.kind === "best_value") {
    return typeof value.target === "number" &&
        Number.isFinite(value.target) && value.target > 0
      ? null
      : "best-value target must be finite and positive";
  }
  return isPositiveSafeInteger(value.target)
    ? null
    : "objective target must be a positive safe integer";
}

export function validateCodexResearchSeasonDefinition(
  definition: unknown,
  window: CodexResearchSeasonWindow,
): string | null {
  if (!isObject(definition)) return "definition must be an object";
  if (!isPositiveSafeInteger(definition.version)) {
    return "definition version must be a positive safe integer";
  }
  if (!isNonEmptyString(definition.seasonId)) return "seasonId must be non-empty";
  let expectedWindow: CodexResearchSeasonWindow;
  try {
    expectedWindow = kstCodexResearchSeasonWindow(definition.seasonId);
  } catch (error) {
    return error instanceof Error ? error.message : "seasonId is invalid";
  }
  if (
    !(window.startAt instanceof Date) ||
    !(window.endAt instanceof Date) ||
    Number.isNaN(window.startAt.getTime()) ||
    Number.isNaN(window.endAt.getTime()) ||
    window.startAt.getTime() !== expectedWindow.startAt.getTime() ||
    window.endAt.getTime() !== expectedWindow.endAt.getTime()
  ) {
    return "season window must match the KST calendar month";
  }
  if (!isNonEmptyString(definition.themeId)) return "themeId must be non-empty";
  if (!isNonEmptyString(definition.themeName)) return "themeName must be non-empty";
  if (
    !Array.isArray(definition.primaryCategories) ||
    definition.primaryCategories.length !== 2 ||
    !definition.primaryCategories.every(isCategory) ||
    new Set(definition.primaryCategories).size !== 2 ||
    !isCategory(definition.supportCategory) ||
    definition.primaryCategories.includes(definition.supportCategory)
  ) {
    return "primary and support categories must be three distinct categories";
  }

  if (
    !Array.isArray(definition.objectives) ||
    definition.objectives.length !== CODEX_RESEARCH_OBJECTIVE_COUNT
  ) {
    return "definition must contain exactly 18 objectives";
  }
  const objectiveIds = new Set<string>();
  const groupCounts: Record<CodexResearchObjectiveGroup, number> = {
    basic: 0,
    field: 0,
    expert: 0,
    challenge: 0,
  };
  const objectivePoints: number[] = [];
  for (const objective of definition.objectives) {
    if (!isObject(objective)) return "objective must be an object";
    if (!isNonEmptyString(objective.id) || objectiveIds.has(objective.id)) {
      return "objective IDs must be unique non-empty strings";
    }
    objectiveIds.add(objective.id);
    if (
      objective.group !== "basic" &&
      objective.group !== "field" &&
      objective.group !== "expert" &&
      objective.group !== "challenge"
    ) {
      return "objective group is invalid";
    }
    groupCounts[objective.group] += 1;
    if (!isNonEmptyString(objective.label) || !isNonEmptyString(objective.description)) {
      return "objective label and description must be non-empty";
    }
    if (!isPositiveSafeInteger(objective.points)) {
      return "objective points must be a positive safe integer";
    }
    objectivePoints.push(objective.points);
    const filterError = validateFilter(objective.filter);
    if (filterError) return filterError;
    const ruleError = validateObjectiveRule(objective.rule);
    if (ruleError) return ruleError;
  }
  for (const [group, expected] of Object.entries(CODEX_RESEARCH_GROUP_COUNTS)) {
    if (groupCounts[group as CodexResearchObjectiveGroup] !== expected) {
      return "objective group counts must be 6/6/4/2";
    }
  }
  if (safeSum(objectivePoints) !== CODEX_RESEARCH_OBJECTIVE_SCORE) {
    return "objective score budget must equal 12000";
  }

  if (!Array.isArray(definition.diversityTracks) || definition.diversityTracks.length === 0) {
    return "diversity tracks must be a non-empty array";
  }
  const diversityIds = new Set<string>();
  const diversityBudgets: number[] = [];
  for (const track of definition.diversityTracks) {
    if (!isObject(track)) return "diversity track must be an object";
    if (!isNonEmptyString(track.id) || diversityIds.has(track.id)) {
      return "diversity track IDs must be unique non-empty strings";
    }
    diversityIds.add(track.id);
    if (!isNonEmptyString(track.label)) return "diversity track label must be non-empty";
    const filterError = validateFilter(track.filter);
    if (filterError) return filterError;
    if (!isPositiveSafeInteger(track.pointsPerEntry) || !isPositiveSafeInteger(track.maxEntries)) {
      return "diversity points and cap must be positive safe integers";
    }
    const budget = track.pointsPerEntry * track.maxEntries;
    if (!Number.isSafeInteger(budget)) return "diversity track budget is unsafe";
    diversityBudgets.push(budget);
  }
  if (safeSum(diversityBudgets) !== CODEX_RESEARCH_DIVERSITY_SCORE) {
    return "diversity score budget must equal 5000";
  }

  if (!Array.isArray(definition.recordTracks) || definition.recordTracks.length === 0) {
    return "record tracks must be a non-empty array";
  }
  const recordIds = new Set<string>();
  const recordBudgets: number[] = [];
  for (const track of definition.recordTracks) {
    if (!isObject(track)) return "record track must be an object";
    if (!isNonEmptyString(track.id) || recordIds.has(track.id)) {
      return "record track IDs must be unique non-empty strings";
    }
    recordIds.add(track.id);
    if (!isNonEmptyString(track.label)) return "record track label must be non-empty";
    const filterError = validateFilter(track.filter);
    if (filterError) return filterError;
    if (!Array.isArray(track.milestones) || track.milestones.length === 0) {
      return "record milestones must be a non-empty array";
    }
    let previousValue = 0;
    let previousScore = 0;
    for (const milestone of track.milestones) {
      if (
        !isObject(milestone) ||
        typeof milestone.value !== "number" ||
        !Number.isFinite(milestone.value) ||
        milestone.value <= previousValue ||
        !isPositiveSafeInteger(milestone.score) ||
        milestone.score <= previousScore
      ) {
        return "record milestones must strictly increase";
      }
      previousValue = milestone.value;
      previousScore = milestone.score;
    }
    recordBudgets.push(previousScore);
  }
  if (safeSum(recordBudgets) !== CODEX_RESEARCH_RECORD_SCORE) {
    return "record score budget must equal 3000";
  }
  return null;
}

export function emptyCodexResearchProgress(): CodexResearchProgress {
  return {
    score: 0,
    objectiveProgress: {
      objectives: {},
      diversityEntries: {},
      recordValues: {},
    },
    objectiveCompletedCount: 0,
    diversityScore: 0,
    recordScore: 0,
    scoreReachedAt: null,
    representativeRecord: null,
  };
}

function cloneProgress(previous: CodexResearchProgress): CodexResearchProgress {
  return {
    ...previous,
    objectiveProgress: {
      objectives: Object.fromEntries(
        Object.entries(previous.objectiveProgress.objectives).map(([id, progress]) => [
          id,
          {
            ...progress,
            seenEntryKeys: progress.seenEntryKeys
              ? [...progress.seenEntryKeys]
              : undefined,
          },
        ]),
      ),
      diversityEntries: Object.fromEntries(
        Object.entries(previous.objectiveProgress.diversityEntries).map(
          ([id, entries]) => [id, [...entries]],
        ),
      ),
      recordValues: { ...previous.objectiveProgress.recordValues },
    },
    representativeRecord: previous.representativeRecord
      ? { ...previous.representativeRecord }
      : null,
  };
}

function validateEvent(event: CodexResearchEvent): void {
  if (!isCategory(event.category)) throw new Error("event category is invalid");
  if (!isNonEmptyString(event.entryId)) throw new Error("event entryId is required");
  if (!Number.isSafeInteger(event.amount) || event.amount < 0) {
    throw new Error("event amount must be a non-negative safe integer");
  }
  const allowed = CODEX_RESEARCH_SOURCES[event.category] as readonly string[];
  if (!isNonEmptyString(event.source) || !allowed.includes(event.source)) {
    throw new Error("event source does not match category");
  }
  if (
    event.bestValue !== undefined &&
    (!Number.isFinite(event.bestValue) || event.bestValue < 0)
  ) {
    throw new Error("event bestValue must be finite and non-negative");
  }
}

function matchesFilter(event: CodexResearchEvent, filter: CodexResearchFilter): boolean {
  return event.category === filter.category &&
    (!filter.entryIds || filter.entryIds.includes(event.entryId)) &&
    (!filter.sources || filter.sources.includes(event.source));
}

function addCapped(current: number, amount: number, target: number): number {
  if (current >= target || amount === 0) return current;
  return amount >= target - current ? target : current + amount;
}

function recordScoreFor(
  track: CodexResearchRecordTrack,
  value: number,
): number {
  let score = 0;
  for (const milestone of track.milestones) {
    if (value < milestone.value) break;
    score = milestone.score;
  }
  return score;
}

function storedProgressError(): never {
  throw new Error("stored research progress is inconsistent");
}

function isValidStoredTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function assertStoredProgressConsistent(
  definition: CodexResearchDefinitionSnapshot,
  progress: CodexResearchProgress,
): void {
  if (
    !isObject(progress) ||
    !Number.isSafeInteger(progress.score) ||
    progress.score < 0 ||
    progress.score > CODEX_RESEARCH_MAX_SCORE ||
    !Number.isSafeInteger(progress.objectiveCompletedCount) ||
    progress.objectiveCompletedCount < 0 ||
    progress.objectiveCompletedCount > CODEX_RESEARCH_OBJECTIVE_COUNT ||
    !Number.isSafeInteger(progress.diversityScore) ||
    progress.diversityScore < 0 ||
    progress.diversityScore > CODEX_RESEARCH_DIVERSITY_SCORE ||
    !Number.isSafeInteger(progress.recordScore) ||
    progress.recordScore < 0 ||
    progress.recordScore > CODEX_RESEARCH_RECORD_SCORE ||
    (progress.scoreReachedAt !== null &&
      !isValidStoredTimestamp(progress.scoreReachedAt)) ||
    (progress.score > 0 && progress.scoreReachedAt === null) ||
    !isObject(progress.objectiveProgress) ||
    !isObject(progress.objectiveProgress.objectives) ||
    !isObject(progress.objectiveProgress.diversityEntries) ||
    !isObject(progress.objectiveProgress.recordValues)
  ) {
    storedProgressError();
  }

  const objectiveById = new Map(
    definition.objectives.map((objective) => [objective.id, objective]),
  );
  for (const [id, raw] of Object.entries(progress.objectiveProgress.objectives)) {
    const objective = objectiveById.get(id);
    if (!objective || !isObject(raw)) storedProgressError();
    const value = raw.value;
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < 0 ||
      (objective.rule.kind !== "best_value" && !Number.isSafeInteger(value)) ||
      (objective.rule.kind !== "best_value" && value > objective.rule.target)
    ) {
      storedProgressError();
    }
    const completedAt = raw.completedAt;
    if (
      (completedAt !== undefined && !isValidStoredTimestamp(completedAt)) ||
      (value >= objective.rule.target) !== (completedAt !== undefined)
    ) {
      storedProgressError();
    }
    if (objective.rule.kind === "distinct_entries") {
      if (
        !Array.isArray(raw.seenEntryKeys) ||
        raw.seenEntryKeys.length !== value ||
        raw.seenEntryKeys.length > objective.rule.target ||
        raw.seenEntryKeys.some((key) => !isNonEmptyString(key)) ||
        new Set(raw.seenEntryKeys).size !== raw.seenEntryKeys.length
      ) {
        storedProgressError();
      }
    } else if (raw.seenEntryKeys !== undefined) {
      storedProgressError();
    }
  }

  const diversityById = new Map(
    definition.diversityTracks.map((track) => [track.id, track]),
  );
  for (const [id, raw] of Object.entries(
    progress.objectiveProgress.diversityEntries,
  )) {
    const track = diversityById.get(id);
    if (
      !track ||
      !Array.isArray(raw) ||
      raw.length > track.maxEntries ||
      raw.some((key) => !isNonEmptyString(key)) ||
      new Set(raw).size !== raw.length
    ) {
      storedProgressError();
    }
  }

  const recordById = new Map(
    definition.recordTracks.map((track) => [track.id, track]),
  );
  for (const [id, value] of Object.entries(progress.objectiveProgress.recordValues)) {
    if (
      !recordById.has(id) ||
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < 0
    ) {
      storedProgressError();
    }
  }

  if (progress.representativeRecord !== null) {
    const representative = progress.representativeRecord;
    if (
      !isObject(representative) ||
      !recordById.has(representative.trackId) ||
      !isCategory(representative.category) ||
      !isNonEmptyString(representative.entryId) ||
      typeof representative.value !== "number" ||
      !Number.isFinite(representative.value) ||
      representative.value < 0 ||
      !isValidStoredTimestamp(representative.recordedAt)
    ) {
      storedProgressError();
    }
  }

  const completedObjectives = definition.objectives.filter(
    (objective) =>
      progress.objectiveProgress.objectives[objective.id]?.completedAt !== undefined,
  );
  const objectiveScore = safeSum(completedObjectives.map((item) => item.points));
  const diversityScore = safeSum(definition.diversityTracks.map((track) =>
    (progress.objectiveProgress.diversityEntries[track.id]?.length ?? 0) *
      track.pointsPerEntry
  ));
  const recordScore = safeSum(definition.recordTracks.map((track) =>
    recordScoreFor(track, progress.objectiveProgress.recordValues[track.id] ?? 0)
  ));
  const total = objectiveScore === null || diversityScore === null || recordScore === null
    ? null
    : safeSum([objectiveScore, diversityScore, recordScore]);
  if (
    completedObjectives.length !== progress.objectiveCompletedCount ||
    diversityScore !== progress.diversityScore ||
    recordScore !== progress.recordScore ||
    total !== progress.score
  ) {
    storedProgressError();
  }
}

export function applyCodexResearchEvents(
  definition: CodexResearchDefinitionSnapshot,
  previous: CodexResearchProgress,
  events: readonly CodexResearchEvent[],
  now: Date = new Date(),
): { changed: boolean; next: CodexResearchProgress } {
  const definitionError = validateCodexResearchSeasonDefinition(
    definition,
    kstCodexResearchSeasonWindow(definition.seasonId),
  );
  if (definitionError) throw new Error(definitionError);
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new Error("now must be a valid date");
  }
  assertStoredProgressConsistent(definition, previous);
  for (const event of events) validateEvent(event);

  const next = cloneProgress(previous);
  const timestamp = now.toISOString();
  let changed = false;

  for (const event of events) {
    for (const objective of definition.objectives) {
      if (!matchesFilter(event, objective.filter)) continue;
      const current = next.objectiveProgress.objectives[objective.id] ?? { value: 0 };
      let value = current.value;
      let seenEntryKeys = current.seenEntryKeys;
      if (objective.rule.kind === "count") {
        value = addCapped(current.value, event.amount, objective.rule.target);
      } else if (objective.rule.kind === "distinct_entries") {
        const seen = new Set(current.seenEntryKeys ?? []);
        if (event.amount > 0 && seen.size < objective.rule.target) {
          seen.add(`${event.category}:${event.entryId}`);
        }
        seenEntryKeys = [...seen].slice(0, objective.rule.target).sort();
        value = seenEntryKeys.length;
      } else if (event.amount > 0 && event.bestValue !== undefined) {
        value = Math.max(current.value, event.bestValue);
      }
      const completed = value >= objective.rule.target;
      const completedAt = current.completedAt ?? (completed ? timestamp : undefined);
      if (
        value !== current.value ||
        completedAt !== current.completedAt ||
        JSON.stringify(seenEntryKeys) !== JSON.stringify(current.seenEntryKeys)
      ) {
        next.objectiveProgress.objectives[objective.id] = {
          value,
          ...(seenEntryKeys ? { seenEntryKeys } : {}),
          ...(completedAt ? { completedAt } : {}),
        };
        changed = true;
      }
    }

    for (const track of definition.diversityTracks) {
      if (event.amount <= 0 || !matchesFilter(event, track.filter)) continue;
      const entries = next.objectiveProgress.diversityEntries[track.id] ?? [];
      const key = `${event.category}:${event.entryId}`;
      if (entries.length < track.maxEntries && !entries.includes(key)) {
        next.objectiveProgress.diversityEntries[track.id] = [...entries, key].sort();
        changed = true;
      }
    }

    for (const track of definition.recordTracks) {
      if (
        event.amount <= 0 ||
        event.bestValue === undefined ||
        !matchesFilter(event, track.filter)
      ) {
        continue;
      }
      const current = next.objectiveProgress.recordValues[track.id] ?? 0;
      if (event.bestValue > current) {
        next.objectiveProgress.recordValues[track.id] = event.bestValue;
        next.representativeRecord = {
          trackId: track.id,
          category: event.category,
          entryId: event.entryId,
          value: event.bestValue,
          recordedAt: timestamp,
        };
        changed = true;
      }
    }
  }

  if (!changed) return { changed: false, next: previous };

  const completedObjectives = definition.objectives.filter(
    (objective) => next.objectiveProgress.objectives[objective.id]?.completedAt,
  );
  const objectiveScore = safeSum(completedObjectives.map((objective) => objective.points));
  if (objectiveScore === null) throw new Error("objective score is unsafe");
  const diversityScore = safeSum(definition.diversityTracks.map((track) =>
    Math.min(
      track.maxEntries,
      next.objectiveProgress.diversityEntries[track.id]?.length ?? 0,
    ) * track.pointsPerEntry
  ));
  if (diversityScore === null) throw new Error("diversity score is unsafe");
  const recordScore = safeSum(definition.recordTracks.map((track) =>
    recordScoreFor(track, next.objectiveProgress.recordValues[track.id] ?? 0)
  ));
  if (recordScore === null) throw new Error("record score is unsafe");
  const score = safeSum([objectiveScore, diversityScore, recordScore]);
  if (score === null || score > CODEX_RESEARCH_MAX_SCORE) {
    throw new Error("research score exceeds the season cap");
  }

  next.objectiveCompletedCount = completedObjectives.length;
  next.diversityScore = diversityScore;
  next.recordScore = recordScore;
  next.score = score;
  if (score > previous.score) next.scoreReachedAt = timestamp;
  return { changed: true, next };
}
