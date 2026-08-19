import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  codexMasteryProgress,
  codexMasterySummary,
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
        "scoreReachedAt", "updatedAt",
      ]),
    );
  });

  it("orders every leaderboard tie by first reach time, then user ID", () => {
    const expectedRankIndexes = [
      ["codex_mastery_summary_total_score_rank_idx", "total_score_milli"],
      ["codex_mastery_summary_equipment_score_rank_idx", "equipment_score_milli"],
      ["codex_mastery_summary_fish_score_rank_idx", "fish_score_milli"],
      ["codex_mastery_summary_monster_score_rank_idx", "monster_score_milli"],
      ["codex_mastery_summary_cooking_score_rank_idx", "cooking_score_milli"],
      ["codex_mastery_summary_life_score_rank_idx", "life_score_milli"],
      ["codex_mastery_summary_job_score_rank_idx", "job_score_milli"],
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

    for (const [indexName, scoreColumn] of expectedRankIndexes) {
      expect(indexes.get(indexName)).toEqual([
        { name: scoreColumn, order: "desc", nulls: "last" },
        { name: "score_reached_at", order: "asc", nulls: "last" },
        { name: "user_id", order: "asc", nulls: "last" },
      ]);
    }
  });
});
