import {
  buildCodexResearchSettlementPreview,
  previewCodexResearchDefinition,
  type CodexResearchSettlementPreview,
} from "@/adventure/data/v2/codexResearchOps";
import {
  validateCodexResearchSeasonDefinition,
  type CodexResearchDefinitionSnapshot,
} from "@/adventure/data/v2/codexResearch";
import { codexResearchTierFor } from "@/adventure/data/v2/codexResearchRanking";
import {
  closeCodexResearchSeason,
  lockCodexResearchSeasonForSettlement,
  markCodexResearchSeasonResettling,
  scheduleCodexResearchSeason,
  writeCodexResearchFinalResults,
  type CodexResearchFinalResult,
  type CodexResearchSeasonState,
} from "./codexResearchRepository";
import {
  countCodexResearchSeasonTrophies,
  readCodexResearchSeasonForOps,
} from "./codexResearchOpsRepository";
import {
  readCodexResearchSettlementCandidates,
  type CodexResearchSettlementCandidate,
} from "./codexResearchSettlement";
import type { DbExecutor, DbTransactionExecutor } from "./savesKv";

export type CodexResearchOpsErrorCode =
  | "invalid_definition"
  | "invalid_request"
  | "season_not_found"
  | "season_not_future"
  | "season_not_ready"
  | "season_already_published"
  | "trophies_not_published"
  | "trophies_already_published";

export class CodexResearchOpsError extends Error {
  readonly code: CodexResearchOpsErrorCode;
  readonly status: number;

  constructor(code: CodexResearchOpsErrorCode, status: number, message: string) {
    super(message);
    this.name = "CodexResearchOpsError";
    this.code = code;
    this.status = status;
  }
}

function validDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function requireNow(now: Date): void {
  if (!validDate(now)) {
    throw new CodexResearchOpsError(
      "invalid_request",
      400,
      "기준 시각이 올바르지 않습니다.",
    );
  }
}

export type CodexResearchSettlementPreviewRuntime<Executor> = {
  readSeason(
    executor: Executor,
    seasonId: string,
  ): Promise<CodexResearchSeasonState | null>;
  readCandidates(
    executor: Executor,
    seasonId: string,
    adminEmails: readonly string[],
    now: Date,
  ): Promise<CodexResearchSettlementCandidate[]>;
};

export function createCodexResearchSettlementPreviewForOps<Executor>(
  runtime: CodexResearchSettlementPreviewRuntime<Executor>,
) {
  return async (
    executor: Executor,
    input: {
      seasonId: string;
      adminEmails: readonly string[];
      now: Date;
    },
  ): Promise<CodexResearchSettlementPreview> => {
    requireNow(input.now);
    const season = await runtime.readSeason(executor, input.seasonId);
    if (!season) {
      throw new CodexResearchOpsError(
        "season_not_found",
        404,
        "도감 연구 시즌을 찾을 수 없습니다.",
      );
    }
    if (season.seasonId !== input.seasonId) {
      throw new Error("codex research season identity is inconsistent");
    }
    const candidates = await runtime.readCandidates(
      executor,
      input.seasonId,
      input.adminEmails,
      input.now,
    );
    return buildCodexResearchSettlementPreview(input.seasonId, candidates);
  };
}

export type CodexResearchSeasonSchedulerRuntime<Executor, Result> = {
  schedule(
    executor: Executor,
    definition: CodexResearchDefinitionSnapshot,
    now: Date,
  ): Promise<Result>;
};

export function createCodexResearchSeasonSchedulerForOps<Executor, Result>(
  runtime: CodexResearchSeasonSchedulerRuntime<Executor, Result>,
) {
  return async (
    executor: Executor,
    input: { definition: unknown; now: Date },
  ): Promise<Result> => {
    requireNow(input.now);
    let preview;
    try {
      preview = previewCodexResearchDefinition(input.definition, input.now);
    } catch (error) {
      throw new CodexResearchOpsError(
        "invalid_definition",
        400,
        error instanceof Error ? error.message : "도감 연구 정의가 올바르지 않습니다.",
      );
    }
    if (!preview.schedulable) {
      throw new CodexResearchOpsError(
        "season_not_future",
        409,
        "시작 시각이 미래인 시즌만 예약할 수 있습니다.",
      );
    }
    return runtime.schedule(
      executor,
      structuredClone(input.definition) as CodexResearchDefinitionSnapshot,
      input.now,
    );
  };
}

export type CodexResearchResettlementRuntime<Executor> = {
  lockSeason(executor: Executor, seasonId: string): Promise<CodexResearchSeasonState>;
  countTrophies(executor: Executor, seasonId: string): Promise<number>;
  markResettling(executor: Executor, seasonId: string, now: Date): Promise<void>;
  readCandidates(
    executor: Executor,
    seasonId: string,
    adminEmails: readonly string[],
    now: Date,
  ): Promise<CodexResearchSettlementCandidate[]>;
  writeResults(
    executor: Executor,
    seasonId: string,
    results: readonly CodexResearchFinalResult[],
    now: Date,
  ): Promise<void>;
  closeSeason(executor: Executor, seasonId: string, now: Date): Promise<void>;
};

export function createCodexResearchResettlement<Executor>(
  runtime: CodexResearchResettlementRuntime<Executor>,
) {
  return async (
    executor: Executor,
    input: {
      seasonId: string;
      adminEmails: readonly string[];
      now: Date;
    },
  ) => {
    requireNow(input.now);
    const season = await runtime.lockSeason(executor, input.seasonId);
    if (season.seasonId !== input.seasonId) {
      throw new Error("codex research season identity is inconsistent");
    }
    if (
      season.status !== "closed" ||
      !season.settledAt ||
      season.endAt.getTime() > input.now.getTime()
    ) {
      throw new CodexResearchOpsError(
        "season_not_ready",
        409,
        "종료되어 닫힌 시즌만 재결산할 수 있습니다.",
      );
    }
    if (season.publishedAt) {
      throw new CodexResearchOpsError(
        "season_already_published",
        409,
        "공개된 시즌은 재결산할 수 없습니다.",
      );
    }
    const definitionError = validateCodexResearchSeasonDefinition(
      season.definition,
      { startAt: season.startAt, endAt: season.endAt },
    );
    if (definitionError) {
      throw new Error(`stored codex research definition is invalid: ${definitionError}`);
    }
    const trophyCount = await runtime.countTrophies(executor, input.seasonId);
    if (!Number.isSafeInteger(trophyCount) || trophyCount < 0) {
      throw new Error("codex research trophy count is invalid");
    }
    if (trophyCount > 0) {
      throw new CodexResearchOpsError(
        "trophies_already_published",
        409,
        "트로피가 발급된 시즌은 재결산할 수 없습니다.",
      );
    }

    await runtime.markResettling(executor, input.seasonId, input.now);
    const candidates = await runtime.readCandidates(
      executor,
      input.seasonId,
      input.adminEmails,
      input.now,
    );
    const preview = buildCodexResearchSettlementPreview(
      input.seasonId,
      candidates,
    );
    const results = candidates.map((candidate): CodexResearchFinalResult => ({
      userId: candidate.userId,
      finalRank: candidate.finalRank,
      finalTier: codexResearchTierFor(candidate.score, candidate.finalRank),
    }));
    await runtime.writeResults(
      executor,
      input.seasonId,
      results,
      input.now,
    );
    await runtime.closeSeason(executor, input.seasonId, input.now);
    return {
      status: "resettled" as const,
      seasonId: input.seasonId,
      participantCount: preview.participantCount,
      tierCounts: preview.tierCounts,
    };
  };
}

const PREVIEW_RUNTIME: CodexResearchSettlementPreviewRuntime<DbExecutor> = {
  readSeason: readCodexResearchSeasonForOps,
  readCandidates: readCodexResearchSettlementCandidates,
};

const SCHEDULE_RUNTIME: CodexResearchSeasonSchedulerRuntime<
  DbTransactionExecutor,
  CodexResearchSeasonState
> = {
  schedule: scheduleCodexResearchSeason,
};

const RESETTLEMENT_RUNTIME: CodexResearchResettlementRuntime<
  DbTransactionExecutor
> = {
  lockSeason: lockCodexResearchSeasonForSettlement,
  countTrophies: countCodexResearchSeasonTrophies,
  markResettling: markCodexResearchSeasonResettling,
  readCandidates: readCodexResearchSettlementCandidates,
  writeResults: writeCodexResearchFinalResults,
  closeSeason: closeCodexResearchSeason,
};

export const previewCodexResearchSettlementForOps =
  createCodexResearchSettlementPreviewForOps(PREVIEW_RUNTIME);

export const scheduleCodexResearchSeasonForOps =
  createCodexResearchSeasonSchedulerForOps(SCHEDULE_RUNTIME);

export const resettleCodexResearchSeason = createCodexResearchResettlement(
  RESETTLEMENT_RUNTIME,
);
