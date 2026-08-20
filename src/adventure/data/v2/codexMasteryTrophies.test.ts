import { describe, expect, it } from "vitest";
import { createCodexMasteryCatalog } from "./codexMasteryCatalog";
import { emptyCodexMasteryProgress } from "./codexMastery";
import type {
  CodexMasteryCategory,
  CodexMasteryEntryDefinition,
  CodexMasteryProgress,
  CodexMasteryStage,
} from "./codexMasteryTypes";
import {
  CODEX_MASTERY_TROPHY_DEFINITIONS,
  codexTrophyDisplayCategory,
  evaluateCodexMasteryTrophies,
  isCodexTrophyId,
  type CodexMasteryTrophyHistory,
} from "./codexMasteryTrophies";

const NOW = new Date("2026-08-20T09:00:00.000Z");
const CATEGORIES: readonly CodexMasteryCategory[] = [
  "equipment",
  "fish",
  "monster",
  "cooking",
  "life",
  "job",
];

function definition(
  category: CodexMasteryCategory,
  entryId: string,
): CodexMasteryEntryDefinition {
  return {
    category,
    entryId,
    label: `${category}-${entryId}`,
    thresholds: {
      bronze: 1,
      silver: 2,
      gold: 3,
      platinum: 4,
      diamond: 5,
      legendary: 6,
    },
    scoreWeightMilli: 1_000,
    seals: {},
  };
}

function progress(
  category: CodexMasteryCategory,
  entryId: string,
  currentTier: CodexMasteryStage,
  achievedAt = NOW.toISOString(),
): CodexMasteryProgress {
  const countByTier: Record<CodexMasteryStage, number> = {
    discovered: 0,
    bronze: 1,
    silver: 2,
    gold: 3,
    platinum: 4,
    diamond: 5,
    legendary: 6,
  };
  const stages: CodexMasteryStage[] = [
    "discovered",
    "bronze",
    "silver",
    "gold",
    "platinum",
    "diamond",
    "legendary",
  ];
  const tierAchievedAt = Object.fromEntries(
    stages
      .slice(0, stages.indexOf(currentTier) + 1)
      .map((stage) => [stage, achievedAt]),
  );
  return {
    ...emptyCodexMasteryProgress(category, entryId),
    count: countByTier[currentTier],
    currentTier,
    tierAchievedAt,
  };
}

function categoryCatalog(entriesPerCategory: number) {
  return createCodexMasteryCatalog(
    CATEGORIES.flatMap((category) =>
      Array.from({ length: entriesPerCategory }, (_, index) =>
        definition(category, `entry-${index + 1}`),
      ),
    ),
  );
}

describe("codex mastery trophies", () => {
  it("recognizes permanent and calendar-month research trophy IDs", () => {
    expect(isCodexTrophyId("mastery:fish")).toBe(true);
    expect(isCodexTrophyId("research:2026-08")).toBe(true);
    expect(isCodexTrophyId("research:2026-13")).toBe(false);
    expect(isCodexTrophyId("research:1999-12")).toBe(false);
    expect(isCodexTrophyId("research:2026-08 ")).toBe(false);
    expect(isCodexTrophyId("research:2026-8")).toBe(false);
    expect(codexTrophyDisplayCategory("mastery:fish")).toBe("fish");
    expect(codexTrophyDisplayCategory("research:2026-08")).toBe("research");
    expect(codexTrophyDisplayCategory("research:2026-13")).toBeNull();
  });

  it("exposes one stable family for every category and the overall trophy", () => {
    expect(CODEX_MASTERY_TROPHY_DEFINITIONS.map(({ id, title }) => [id, title])).toEqual([
      ["mastery:equipment", "무구의 기록자"],
      ["mastery:fish", "만경의 어탁"],
      ["mastery:monster", "대륙 생태 표본"],
      ["mastery:cooking", "왕실의 조리도구"],
      ["mastery:life", "대지의 관찰일지"],
      ["mastery:job", "천직의 문장"],
      ["mastery:overall", "모험왕의 대서"],
    ]);
  });

  it("uses ceiling boundaries for bronze and silver category trophies", () => {
    const catalog = categoryCatalog(5);
    const oneBronze = [progress("equipment", "entry-1", "bronze")];
    const twoBronze = [...oneBronze, progress("equipment", "entry-2", "bronze")];
    const twoSilver = [
      progress("equipment", "entry-1", "silver"),
      progress("equipment", "entry-2", "silver"),
    ];
    const threeSilver = [...twoSilver, progress("equipment", "entry-3", "silver")];

    expect(evaluateCodexMasteryTrophies({ catalog, progressRows: oneBronze, history: [], now: NOW })
      .trophies.find((item) => item.trophyId === "mastery:equipment")?.currentTier).toBeNull();
    expect(evaluateCodexMasteryTrophies({ catalog, progressRows: twoBronze, history: [], now: NOW })
      .trophies.find((item) => item.trophyId === "mastery:equipment")?.currentTier).toBe("bronze");
    expect(evaluateCodexMasteryTrophies({ catalog, progressRows: twoSilver, history: [], now: NOW })
      .trophies.find((item) => item.trophyId === "mastery:equipment")?.currentTier).toBe("bronze");
    expect(evaluateCodexMasteryTrophies({ catalog, progressRows: threeSilver, history: [], now: NOW })
      .trophies.find((item) => item.trophyId === "mastery:equipment")?.currentTier).toBe("silver");
  });

  it("requires all gold before platinum and diamond percentage promotions", () => {
    const catalog = categoryCatalog(4);
    const almostGold = [
      progress("equipment", "entry-1", "diamond"),
      progress("equipment", "entry-2", "diamond"),
      progress("equipment", "entry-3", "gold"),
    ];
    const allGoldOnePlatinum = [
      progress("equipment", "entry-1", "platinum"),
      progress("equipment", "entry-2", "gold"),
      progress("equipment", "entry-3", "gold"),
      progress("equipment", "entry-4", "gold"),
    ];
    const allGoldTwoDiamond = [
      progress("equipment", "entry-1", "diamond"),
      progress("equipment", "entry-2", "diamond"),
      progress("equipment", "entry-3", "gold"),
      progress("equipment", "entry-4", "gold"),
    ];

    expect(evaluateCodexMasteryTrophies({ catalog, progressRows: almostGold, history: [], now: NOW })
      .trophies.find((item) => item.trophyId === "mastery:equipment")?.currentTier).toBe("silver");
    expect(evaluateCodexMasteryTrophies({ catalog, progressRows: allGoldOnePlatinum, history: [], now: NOW })
      .trophies.find((item) => item.trophyId === "mastery:equipment")?.currentTier).toBe("platinum");
    expect(evaluateCodexMasteryTrophies({ catalog, progressRows: allGoldTwoDiamond, history: [], now: NOW })
      .trophies.find((item) => item.trophyId === "mastery:equipment")?.currentTier).toBe("diamond");
  });

  it("promotes the overall family only when all six categories own the tier", () => {
    const catalog = categoryCatalog(1);
    const fiveLegendary = CATEGORIES.slice(0, 5).map((category) =>
      progress(category, "entry-1", "legendary"),
    );
    const allLegendary = [
      ...fiveLegendary,
      progress("job", "entry-1", "legendary"),
    ];

    expect(evaluateCodexMasteryTrophies({ catalog, progressRows: fiveLegendary, history: [], now: NOW })
      .trophies.find((item) => item.trophyId === "mastery:overall")?.currentTier).toBeNull();
    expect(evaluateCodexMasteryTrophies({ catalog, progressRows: allLegendary, history: [], now: NOW })
      .trophies.find((item) => item.trophyId === "mastery:overall")?.currentTier).toBe("legendary");
  });

  it("records every skipped promotion and reconstructs the threshold-crossing time", () => {
    const catalog = categoryCatalog(4);
    const rows = [
      progress("equipment", "entry-1", "gold", "2026-01-01T00:00:00.000Z"),
      progress("equipment", "entry-2", "gold", "2026-02-01T00:00:00.000Z"),
      progress("equipment", "entry-3", "gold", "2026-03-01T00:00:00.000Z"),
      progress("equipment", "entry-4", "gold", "2026-04-01T00:00:00.000Z"),
    ];

    const result = evaluateCodexMasteryTrophies({
      catalog,
      progressRows: rows,
      history: [],
      now: NOW,
    });
    const trophy = result.trophies.find((item) => item.trophyId === "mastery:equipment");

    expect(result.promotions.filter((item) => item.trophyId === "mastery:equipment"))
      .toEqual([
        { trophyId: "mastery:equipment", tier: "bronze", achievedAt: "2026-01-01T00:00:00.000Z" },
        { trophyId: "mastery:equipment", tier: "silver", achievedAt: "2026-02-01T00:00:00.000Z" },
        { trophyId: "mastery:equipment", tier: "gold", achievedAt: "2026-04-01T00:00:00.000Z" },
      ]);
    expect(trophy?.tierAchievedAt.gold).toBe("2026-04-01T00:00:00.000Z");
  });

  it("never revokes a stored trophy when a larger catalog lowers completion", () => {
    const catalog = categoryCatalog(5);
    const history: CodexMasteryTrophyHistory[] = [{
      trophyId: "mastery:equipment",
      kind: "mastery_category",
      currentTier: "gold",
      tierAchievedAt: {
        bronze: "2026-01-01T00:00:00.000Z",
        silver: "2026-02-01T00:00:00.000Z",
        gold: "2026-03-01T00:00:00.000Z",
      },
      catalogVersion: 1,
    }];
    const result = evaluateCodexMasteryTrophies({
      catalog,
      progressRows: [progress("equipment", "entry-1", "gold")],
      history,
      now: NOW,
    });
    const trophy = result.trophies.find((item) => item.trophyId === "mastery:equipment");

    expect(trophy?.currentTier).toBe("gold");
    expect(trophy?.tierAchievedAt.gold).toBe("2026-03-01T00:00:00.000Z");
    expect(result.promotions).toEqual([]);
    expect(trophy?.nextProgress).toMatchObject({ tier: "platinum", current: 0, required: 2 });
  });
});
