import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  codexMasteryProgress,
  codexMasterySummary,
  codexResearchProgress,
  codexTrophyHistory,
} from "./schema";

describe("codex mastery schema", () => {
  it("exports dedicated progress and indexed-summary tables", () => {
    expect(getTableName(codexMasteryProgress)).toBe("codex_mastery_progress");
    expect(Object.keys(getTableColumns(codexMasteryProgress))).toEqual(
      expect.arrayContaining([
        "userId", "category", "entryId", "count", "bestValue",
        "currentTier", "sealIds", "tierAchievedAt", "scoreMilli",
        "firstRecordedAt", "updatedAt",
      ]),
    );
    expect(getTableName(codexMasterySummary)).toBe("codex_mastery_summary");
    expect(Object.keys(getTableColumns(codexMasterySummary))).toEqual(
      expect.arrayContaining([
        "userId", "totalScoreMilli", "equipmentScoreMilli", "fishScoreMilli",
        "monsterScoreMilli", "cookingScoreMilli", "lifeScoreMilli",
        "jobScoreMilli", "bronzeCount", "silverCount", "goldCount",
        "platinumCount", "diamondCount", "legendaryCount", "sealCount",
        "scoredCategoryCount", "scoreReachedAt", "equipmentScoreReachedAt",
        "fishScoreReachedAt", "monsterScoreReachedAt", "cookingScoreReachedAt",
        "lifeScoreReachedAt", "jobScoreReachedAt", "updatedAt",
      ]),
    );
  });

  it("persists monotonic trophy families outside the save JSON", () => {
    expect(getTableName(codexTrophyHistory)).toBe("codex_trophy_history");
    expect(Object.keys(getTableColumns(codexTrophyHistory))).toEqual([
      "userId",
      "trophyId",
      "trophyKind",
      "currentTier",
      "tierAchievedAt",
      "catalogVersion",
      "seasonMetadata",
      "updatedAt",
    ]);

    const config = getTableConfig(codexTrophyHistory);
    expect(config.primaryKeys).toHaveLength(1);
    expect(config.primaryKeys[0].columns.map((column) => column.name)).toEqual([
      "user_id",
      "trophy_id",
    ]);
    expect(config.foreignKeys).toHaveLength(1);
    expect(config.foreignKeys[0].onDelete).toBe("cascade");
    expect(config.indexes.map((index) => index.config.name)).toContain(
      "codex_trophy_history_user_kind_tier_idx",
    );
  });

  it("enforces one immutable final rank per monthly season", () => {
    const config = getTableConfig(codexResearchProgress);
    const index = config.indexes.find((candidate) =>
      candidate.config.name === "codex_research_progress_season_final_rank_unique"
    );

    expect(index?.config.unique).toBe(true);
    expect(index?.config.columns.map((column) => (
      "name" in column ? column.name : null
    ))).toEqual(["season_id", "final_rank"]);
    expect(index?.config.where).toBeDefined();
  });

  it("orders every leaderboard by the complete approved tie contract", () => {
    const expectedRankIndexes = [
      ["codex_mastery_summary_total_score_rank_idx", "total_score_milli", "score_reached_at"],
      ["codex_mastery_summary_equipment_score_rank_idx", "equipment_score_milli", "equipment_score_reached_at"],
      ["codex_mastery_summary_fish_score_rank_idx", "fish_score_milli", "fish_score_reached_at"],
      ["codex_mastery_summary_monster_score_rank_idx", "monster_score_milli", "monster_score_reached_at"],
      ["codex_mastery_summary_cooking_score_rank_idx", "cooking_score_milli", "cooking_score_reached_at"],
      ["codex_mastery_summary_life_score_rank_idx", "life_score_milli", "life_score_reached_at"],
      ["codex_mastery_summary_job_score_rank_idx", "job_score_milli", "job_score_reached_at"],
    ] as const;
    const indexes = new Map(
      getTableConfig(codexMasterySummary).indexes.map((index) => [
        index.config.name,
        index.config.columns.map((column) => {
          const indexedColumn = column as {
            name?: string;
            indexConfig?: { order?: string; nulls?: string };
          };
          return {
            name: indexedColumn.name,
            order: indexedColumn.indexConfig?.order,
            nulls: indexedColumn.indexConfig?.nulls,
          };
        }),
      ]),
    );

    for (const [indexName, scoreColumn, reachedAtColumn] of expectedRankIndexes) {
      expect(indexes.get(indexName)).toEqual([
        { name: scoreColumn, order: "desc", nulls: "last" },
        { name: "gold_count", order: "desc", nulls: "last" },
        { name: "seal_count", order: "desc", nulls: "last" },
        { name: "scored_category_count", order: "desc", nulls: "last" },
        { name: reachedAtColumn, order: "asc", nulls: "last" },
        { name: "user_id", order: "asc", nulls: "last" },
      ]);
    }
  });
});
