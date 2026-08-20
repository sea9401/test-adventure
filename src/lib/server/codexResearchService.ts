import {
  applyCodexResearchEvents,
  emptyCodexResearchProgress,
  isCodexResearchSeasonOpen,
  validateCodexResearchSeasonDefinition,
  type CodexResearchEvent,
  type CodexResearchPersonalView,
  type CodexResearchProgress,
} from "@/adventure/data/v2/codexResearch";
import {
  activateCodexResearchSeason,
  lockCodexResearchProgress,
  readCodexResearchProgress,
  readCurrentCodexResearchSeason,
  saveCodexResearchProgress,
  type CodexResearchSeasonState,
} from "./codexResearchRepository";
import type { DbExecutor, DbTransactionExecutor } from "./savesKv";

export type CodexResearchRecordResult =
  | { recorded: false; reason: "no_active_season" | "unchanged" }
  | {
      recorded: true;
      seasonId: string;
      progress: CodexResearchProgress;
    };

export type CodexResearchRecordingRuntime<Executor> = {
  readCurrent(
    executor: Executor,
    now: Date,
  ): Promise<CodexResearchSeasonState | null>;
  lockProgress(
    executor: Executor,
    userId: string,
    seasonId: string,
    now: Date,
  ): Promise<CodexResearchProgress>;
  saveProgress(
    executor: Executor,
    userId: string,
    seasonId: string,
    progress: CodexResearchProgress,
    now: Date,
  ): Promise<void>;
  activateSeason(
    executor: Executor,
    seasonId: string,
    now: Date,
  ): Promise<void>;
};

export type CodexResearchPersonalReadRuntime<Executor> = {
  readCurrent(
    executor: Executor,
    now: Date,
  ): Promise<CodexResearchSeasonState | null>;
  readProgress(
    executor: Executor,
    userId: string,
    seasonId: string,
  ): Promise<CodexResearchProgress | null>;
};

function activeSeasonAt(
  season: CodexResearchSeasonState | null,
  now: Date,
): CodexResearchSeasonState | null {
  if (!season) return null;
  if (
    season.status !== "scheduled" &&
    season.status !== "active"
  ) {
    return null;
  }
  if (!isCodexResearchSeasonOpen({
    startAt: season.startAt,
    endAt: season.endAt,
  }, now)) {
    return null;
  }
  const validation = validateCodexResearchSeasonDefinition(
    season.definition,
    { startAt: season.startAt, endAt: season.endAt },
  );
  if (validation) throw new Error(validation);
  if (
    season.definition.seasonId !== season.seasonId ||
    season.definition.themeId !== season.themeId
  ) {
    throw new Error("codex research season identity is inconsistent");
  }
  return season;
}

export function createCodexResearchRecorder<Executor>(
  runtime: CodexResearchRecordingRuntime<Executor>,
) {
  return async (
    executor: Executor,
    userId: string,
    events: readonly CodexResearchEvent[],
    now: Date = new Date(),
  ): Promise<CodexResearchRecordResult> => {
    const season = activeSeasonAt(await runtime.readCurrent(executor, now), now);
    if (!season) return { recorded: false, reason: "no_active_season" };

    const progress = await runtime.lockProgress(
      executor,
      userId,
      season.seasonId,
      now,
    );
    const transition = applyCodexResearchEvents(
      season.definition,
      progress,
      events,
      now,
    );
    if (!transition.changed) {
      return { recorded: false, reason: "unchanged" };
    }
    await runtime.saveProgress(
      executor,
      userId,
      season.seasonId,
      transition.next,
      now,
    );
    if (season.status === "scheduled") {
      await runtime.activateSeason(executor, season.seasonId, now);
    }
    return {
      recorded: true,
      seasonId: season.seasonId,
      progress: transition.next,
    };
  };
}

function objectiveTarget(
  rule: CodexResearchSeasonState["definition"]["objectives"][number]["rule"],
): number {
  return rule.target;
}

function buildPersonalView(
  season: CodexResearchSeasonState,
  progress: CodexResearchProgress,
  now: Date,
): CodexResearchPersonalView {
  // Empty evaluation validates all persisted component totals without mutating them.
  const validated = applyCodexResearchEvents(
    season.definition,
    progress,
    [],
    now,
  ).next;
  return {
    status: "active",
    seasonId: season.seasonId,
    themeId: season.themeId,
    themeName: season.definition.themeName,
    startAt: season.startAt.toISOString(),
    endAt: season.endAt.toISOString(),
    score: validated.score,
    objectiveScore:
      validated.score - validated.diversityScore - validated.recordScore,
    diversityScore: validated.diversityScore,
    recordScore: validated.recordScore,
    objectiveCompletedCount: validated.objectiveCompletedCount,
    objectiveCount: season.definition.objectives.length,
    scoreReachedAt: validated.scoreReachedAt,
    representativeRecord: validated.representativeRecord
      ? { ...validated.representativeRecord }
      : null,
    objectives: season.definition.objectives.map((objective) => {
      const target = objectiveTarget(objective.rule);
      const stored = validated.objectiveProgress.objectives[objective.id];
      const value = stored?.value ?? 0;
      return {
        id: objective.id,
        group: objective.group,
        label: objective.label,
        description: objective.description,
        points: objective.points,
        value,
        target,
        progressPercent: Math.min(
          100,
          Math.max(0, Math.round((value / target) * 100)),
        ),
        completedAt: stored?.completedAt ?? null,
      };
    }),
  };
}

export function createCodexResearchPersonalReader<Executor>(
  runtime: CodexResearchPersonalReadRuntime<Executor>,
) {
  return async (
    executor: Executor,
    userId: string,
    now: Date = new Date(),
  ): Promise<CodexResearchPersonalView> => {
    const season = activeSeasonAt(await runtime.readCurrent(executor, now), now);
    if (!season) return { status: "no_season" };
    const progress = await runtime.readProgress(
      executor,
      userId,
      season.seasonId,
    ) ?? emptyCodexResearchProgress();
    return buildPersonalView(season, progress, now);
  };
}

const DRIZZLE_RECORDING_RUNTIME: CodexResearchRecordingRuntime<
  DbTransactionExecutor
> = {
  readCurrent: readCurrentCodexResearchSeason,
  lockProgress: lockCodexResearchProgress,
  saveProgress: saveCodexResearchProgress,
  activateSeason: activateCodexResearchSeason,
};

const DRIZZLE_READ_RUNTIME: CodexResearchPersonalReadRuntime<DbExecutor> = {
  readCurrent: readCurrentCodexResearchSeason,
  readProgress: readCodexResearchProgress,
};

export const recordCodexResearchGameplayBatch = createCodexResearchRecorder(
  DRIZZLE_RECORDING_RUNTIME,
);

export const readCodexResearchPersonalView = createCodexResearchPersonalReader(
  DRIZZLE_READ_RUNTIME,
);
