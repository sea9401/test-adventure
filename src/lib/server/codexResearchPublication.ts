import { and, eq, sql } from "drizzle-orm";
import type { CodexResearchSeasonTrophyHistory } from "@/adventure/data/v2/codexResearchRanking";
import type { CodexMasteryTrophyTier } from "@/adventure/data/v2/codexMasteryTrophies";
import {
  codexResearchPublications,
  codexTrophyHistory,
  serverFeed,
  type CodexResearchPublicationChannel,
} from "@/db/schema";
import type { FeedPayload } from "@/lib/feed-config";
import type { V2NotificationPayload } from "@/lib/v2-notification-config";
import { insertNotificationWith } from "./v2Notifications";
import {
  lockCodexResearchSeasonForSettlement,
  markCodexResearchSeasonPublished,
  type CodexResearchSeasonState,
} from "./codexResearchRepository";
import {
  codexResearchTrophyHistoryRowToState,
  readCodexResearchFinalists,
  type CodexResearchFinalist,
} from "./codexResearchTrophies";
import { CodexResearchOpsError } from "./codexResearchOps";
import type { DbTransactionExecutor } from "./savesKv";

export type CodexResearchPublishedTrophy = {
  userId: string;
  history: CodexResearchSeasonTrophyHistory;
};

export type CodexResearchHonorPublicationRuntime<Executor> = {
  lockSeason(executor: Executor, seasonId: string): Promise<CodexResearchSeasonState>;
  readFinalists(executor: Executor, seasonId: string): Promise<CodexResearchFinalist[]>;
  readTrophies(executor: Executor, seasonId: string): Promise<CodexResearchPublishedTrophy[]>;
  claimChannel(
    executor: Executor,
    seasonId: string,
    userId: string,
    channel: CodexResearchPublicationChannel,
    now: Date,
  ): Promise<"created" | "existing">;
  writeNotification(
    executor: Executor,
    userId: string,
    payload: V2NotificationPayload,
  ): Promise<void>;
  resolveActorName(executor: Executor, userId: string): Promise<string>;
  writeFeed(
    executor: Executor,
    userId: string,
    actorName: string,
    payload: FeedPayload,
    now: Date,
  ): Promise<void>;
  markPublished(executor: Executor, seasonId: string, now: Date): Promise<Date>;
};

function validDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function matchesTrophy(
  season: CodexResearchSeasonState,
  finalist: CodexResearchFinalist,
  stored: CodexResearchPublishedTrophy | undefined,
): boolean {
  if (!stored || stored.userId !== finalist.userId || !season.settledAt) return false;
  const history = stored.history;
  const metadata = history.seasonMetadata;
  return history.trophyId === `research:${season.seasonId}` &&
    history.kind === "research_season" &&
    history.currentTier === finalist.finalTier &&
    history.catalogVersion === season.definition.version &&
    metadata.seasonId === season.seasonId && metadata.themeId === season.themeId &&
    metadata.themeName === season.definition.themeName &&
    metadata.finalRank === finalist.finalRank && metadata.score === finalist.score &&
    metadata.objectiveCompletedCount === finalist.objectiveCompletedCount &&
    metadata.objectiveScore === finalist.score - finalist.diversityScore - finalist.recordScore &&
    metadata.diversityScore === finalist.diversityScore &&
    metadata.recordScore === finalist.recordScore &&
    metadata.settledAt === season.settledAt.toISOString() &&
    metadata.firstPlaceEngraving === (finalist.finalRank === 1) &&
    JSON.stringify(metadata.representativeRecord) === JSON.stringify(finalist.representativeRecord);
}

function payload(
  season: CodexResearchSeasonState,
  finalist: CodexResearchFinalist,
): V2NotificationPayload & FeedPayload {
  return {
    seasonId: season.seasonId,
    themeName: season.definition.themeName,
    tier: finalist.finalTier,
    finalRank: finalist.finalRank,
    score: finalist.score,
  };
}

export function createCodexResearchHonorPublisher<Executor>(
  runtime: CodexResearchHonorPublicationRuntime<Executor>,
) {
  return async (
    executor: Executor,
    input: { seasonId: string; now: Date; feedEnabled: boolean },
  ) => {
    if (!validDate(input.now)) {
      throw new CodexResearchOpsError("invalid_request", 400, "기준 시각이 올바르지 않습니다.");
    }
    const season = await runtime.lockSeason(executor, input.seasonId);
    if (
      season.seasonId !== input.seasonId || season.status !== "closed" ||
      !season.settledAt || season.endAt.getTime() > input.now.getTime()
    ) {
      throw new CodexResearchOpsError("season_not_ready", 409, "종료·결산된 시즌만 공개할 수 있습니다.");
    }
    const finalists = await runtime.readFinalists(executor, input.seasonId);
    const trophies = await runtime.readTrophies(executor, input.seasonId);
    const trophyByUser = new Map(trophies.map((entry) => [entry.userId, entry]));
    if (
      trophies.length !== finalists.length ||
      finalists.some((finalist) => !matchesTrophy(season, finalist, trophyByUser.get(finalist.userId)))
    ) {
      throw new CodexResearchOpsError(
        "trophies_not_published",
        409,
        "확정 트로피가 모두 발급·검증된 뒤 공개할 수 있습니다.",
      );
    }

    let notificationCreatedCount = 0;
    let notificationExistingCount = 0;
    let feedCreatedCount = 0;
    let feedExistingCount = 0;
    for (const finalist of finalists) {
      const honor = payload(season, finalist);
      const notification = await runtime.claimChannel(
        executor,
        input.seasonId,
        finalist.userId,
        "notification",
        input.now,
      );
      if (notification === "created") {
        await runtime.writeNotification(executor, finalist.userId, honor);
        notificationCreatedCount += 1;
      } else {
        notificationExistingCount += 1;
      }
      if (
        input.feedEnabled &&
        (finalist.finalTier === "diamond" || finalist.finalTier === "legendary")
      ) {
        const feed = await runtime.claimChannel(
          executor,
          input.seasonId,
          finalist.userId,
          "feed",
          input.now,
        );
        if (feed === "created") {
          const actorName = await runtime.resolveActorName(executor, finalist.userId);
          await runtime.writeFeed(
            executor,
            finalist.userId,
            actorName,
            honor,
            input.now,
          );
          feedCreatedCount += 1;
        } else {
          feedExistingCount += 1;
        }
      }
    }
    const publishedAt = await runtime.markPublished(executor, input.seasonId, input.now);
    return {
      status: "published" as const,
      seasonId: input.seasonId,
      publishedAt: publishedAt.toISOString(),
      eligibleCount: finalists.length,
      notificationCreatedCount,
      notificationExistingCount,
      feedCreatedCount,
      feedExistingCount,
    };
  };
}

async function readPublishedTrophies(
  executor: DbTransactionExecutor,
  seasonId: string,
): Promise<CodexResearchPublishedTrophy[]> {
  const rows = await executor
    .select({
      userId: codexTrophyHistory.userId,
      trophyId: codexTrophyHistory.trophyId,
      trophyKind: codexTrophyHistory.trophyKind,
      currentTier: codexTrophyHistory.currentTier,
      tierAchievedAt: codexTrophyHistory.tierAchievedAt,
      catalogVersion: codexTrophyHistory.catalogVersion,
      seasonMetadata: codexTrophyHistory.seasonMetadata,
    })
    .from(codexTrophyHistory)
    .where(and(
      eq(codexTrophyHistory.trophyId, `research:${seasonId}`),
      eq(codexTrophyHistory.trophyKind, "research_season"),
    ));
  return rows.map(({ userId, ...row }) => ({
    userId,
    history: codexResearchTrophyHistoryRowToState(row),
  }));
}

async function claimChannel(
  executor: DbTransactionExecutor,
  seasonId: string,
  userId: string,
  channel: CodexResearchPublicationChannel,
  now: Date,
): Promise<"created" | "existing"> {
  const rows = await executor.insert(codexResearchPublications).values({
    seasonId,
    userId,
    channel,
    publishedAt: now,
  }).onConflictDoNothing().returning({ channel: codexResearchPublications.channel });
  return rows.length === 1 ? "created" : "existing";
}

async function resolveActorName(
  executor: DbTransactionExecutor,
  userId: string,
): Promise<string> {
  const rows = await executor.execute(sql`
    SELECT COALESCE(
      NULLIF(btrim(u.game_name), ''),
      NULLIF(btrim(p.value->>'name'), ''),
      '이름 없는 모험가'
    ) AS name
    FROM users u
    LEFT JOIN saves_kv p ON p.user_id = u.id AND p.key = 'character-profile.v2'
    WHERE u.id = ${userId}
    LIMIT 1
  `);
  const name = (rows.rows as unknown as Array<{ name: unknown }>)[0]?.name;
  if (typeof name !== "string" || name.trim() === "") {
    throw new Error("codex research feed actor is missing");
  }
  return name.trim();
}

const DRIZZLE_RUNTIME: CodexResearchHonorPublicationRuntime<DbTransactionExecutor> = {
  lockSeason: lockCodexResearchSeasonForSettlement,
  readFinalists: readCodexResearchFinalists,
  readTrophies: readPublishedTrophies,
  claimChannel,
  writeNotification: (executor, userId, value) =>
    insertNotificationWith(executor, userId, "codex_research_trophy", value),
  resolveActorName,
  writeFeed: async (executor, userId, actorName, value, now) => {
    await executor.insert(serverFeed).values({
      userId,
      actorName,
      type: "codex_research_result",
      payload: value,
      createdAt: now,
    });
  },
  markPublished: markCodexResearchSeasonPublished,
};

export const publishCodexResearchSeasonHonors = createCodexResearchHonorPublisher(
  DRIZZLE_RUNTIME,
);

export type CodexResearchHonorTier = CodexMasteryTrophyTier;
