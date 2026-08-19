import { getTableColumns, getTableName } from "drizzle-orm";
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
});
