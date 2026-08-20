import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type {
  CodexMasteryCategoryView,
  CodexMasteryEntryView,
  CodexMasterySnapshot,
} from "@/adventure/data/v2/codexMasteryView";
import type { CodexResearchPersonalView } from "@/adventure/data/v2/codexResearch";
import {
  CODEX_MASTERY_PAGE_SIZE,
  CodexMasteryPanel,
  filterCodexMasteryEntries,
  formatCodexMasteryDate,
  paginateCodexMasteryEntries,
} from "./CodexMasteryPanel";

function entry(
  overrides: Partial<CodexMasteryEntryView> = {},
): CodexMasteryEntryView {
  return {
    key: "fish:carp",
    category: "fish",
    entryId: "carp",
    label: "황금 잉어",
    count: 4,
    bestValue: 88.4,
    currentTier: "silver",
    score: 25,
    thresholds: {
      bronze: 1,
      silver: 3,
      gold: 10,
      platinum: 20,
      diamond: 50,
      legendary: 100,
    },
    tierAchievedAt: {
      discovered: "2026-08-01T00:00:00.000Z",
      bronze: "2026-08-02T00:00:00.000Z",
      silver: "2026-08-10T00:00:00.000Z",
    },
    sealIds: ["giant"],
    availableSealIds: ["giant", "night_catch"],
    nextStage: "gold",
    nextThreshold: 10,
    nextProgressPercent: 40,
    pinned: true,
    ...overrides,
  };
}

const categories: CodexMasteryCategoryView[] = [
  "equipment", "fish", "monster", "cooking", "life", "job",
].map((category) => ({
  category: category as CodexMasteryCategoryView["category"],
  score: category === "fish" ? 250 : 0,
  discoveredCount: category === "fish" ? 1 : 0,
  totalEntries: category === "fish" ? 50 : 1,
  goldOrHigherCount: 0,
}));

function snapshot(entries: CodexMasteryEntryView[] = [entry()]): CodexMasterySnapshot {
  return {
    summary: {
      totalScore: 1_234,
      discoveredCount: 1,
      totalEntries: 679,
      sealCount: 1,
      stageCounts: {
        bronze: 4,
        silver: 3,
        gold: 2,
        platinum: 1,
        diamond: 0,
        legendary: 0,
      },
    },
    categories,
    entries,
    pinnedGoals: [{ category: "fish", entryId: "carp" }],
    recentPromotions: [{
      key: "fish:carp",
      category: "fish",
      entryId: "carp",
      label: "황금 잉어",
      stage: "silver",
      achievedAt: "2026-08-10T00:00:00.000Z",
    }],
    nearGoals: [{
      key: "fish:carp",
      category: "fish",
      entryId: "carp",
      label: "황금 잉어",
      currentTier: "silver",
      count: 4,
      nextStage: "gold",
      nextThreshold: 10,
      nextProgressPercent: 40,
      pinned: true,
    }],
    monthlyResearch: null,
    features: {
      rankingVisible: false,
      sealsEnabled: true,
      trophiesEnabled: false,
      monthlyProgressEnabled: false,
    },
  };
}

function activeMonthlyResearch(): CodexResearchPersonalView {
  const groups = [
    ["basic", 6],
    ["field", 6],
    ["expert", 4],
    ["challenge", 2],
  ] as const;
  return {
    status: "active",
    seasonId: "2026-08",
    themeId: "rivers-and-lakes",
    themeName: "강과 호수의 달",
    startAt: "2026-07-31T15:00:00.000Z",
    endAt: "2026-08-31T15:00:00.000Z",
    score: 12_345,
    objectiveScore: 7_200,
    diversityScore: 3_645,
    recordScore: 1_500,
    objectiveCompletedCount: 7,
    objectiveCount: 18,
    scoreReachedAt: "2026-08-20T03:04:05.000Z",
    representativeRecord: {
      trackId: "fish-size",
      category: "fish",
      entryId: "carp",
      value: 121.5,
      recordedAt: "2026-08-20T03:04:05.000Z",
    },
    objectives: groups.flatMap(([group, count]) =>
      Array.from({ length: count }, (_, index) => ({
        id: `${group}-${index + 1}`,
        group,
        label: `월간 목표 ${group}-${index + 1}`,
        description: "한 달 안에 천천히 진행할 수 있는 연구입니다.",
        points: group === "basic" ? 400 : group === "field" ? 600 : 1_000,
        value: index === 0 ? 3 : 1,
        target: 3,
        progressPercent: index === 0 ? 100 : 33,
        completedAt: index === 0 ? "2026-08-10T00:00:00.000Z" : null,
      }))
    ),
  };
}

describe("codex mastery exploration helpers", () => {
  const rows = [
    entry(),
    entry({
      key: "job:warrior",
      category: "job",
      entryId: "warrior",
      label: "전사",
      count: 49,
      currentTier: "discovered",
      nextStage: "bronze",
      nextThreshold: 50,
      nextProgressPercent: 98,
      pinned: false,
      sealIds: [],
      availableSealIds: [],
    }),
    entry({
      key: "equipment:sword",
      category: "equipment",
      entryId: "sword",
      label: "낡은 검",
      count: 0,
      currentTier: "none",
      nextStage: "discovered",
      nextThreshold: null,
      nextProgressPercent: 0,
      pinned: false,
      sealIds: [],
    }),
    entry({
      key: "fish:legend",
      entryId: "legend",
      label: "별의 물고기",
      count: 100,
      currentTier: "platinum",
      nextStage: "diamond",
      nextThreshold: 200,
      nextProgressPercent: 50,
      pinned: false,
      sealIds: [],
      availableSealIds: [],
    }),
  ];

  it("combines category and normalized name/id search", () => {
    expect(filterCodexMasteryEntries(rows, {
      category: "fish",
      filter: "all",
      query: "  GOLDEN ",
      sealsEnabled: true,
    }).map((row) => row.key)).toEqual([]);
    expect(filterCodexMasteryEntries(rows, {
      category: "all",
      filter: "all",
      query: "WARRIOR",
      sealsEnabled: true,
    }).map((row) => row.key)).toEqual(["job:warrior"]);
    expect(filterCodexMasteryEntries(rows, {
      category: "fish",
      filter: "all",
      query: "황금",
      sealsEnabled: true,
    }).map((row) => row.key)).toEqual(["fish:carp"]);
  });

  it.each([
    ["undiscovered", ["equipment:sword"]],
    ["near_next", ["job:warrior"]],
    ["below_gold", ["fish:carp", "job:warrior", "equipment:sword"]],
    ["platinum_plus", ["fish:legend"]],
    ["pinned", ["fish:carp"]],
    ["missing_seal", ["fish:carp", "equipment:sword"]],
  ] as const)("applies the %s progress filter", (filter, expected) => {
    expect(filterCodexMasteryEntries(rows, {
      category: "all",
      filter,
      query: "",
      sealsEnabled: true,
    }).map((row) => row.key)).toEqual(expected);
  });

  it("hides the seal filter while seals are disabled", () => {
    expect(filterCodexMasteryEntries(rows, {
      category: "all",
      filter: "missing_seal",
      query: "",
      sealsEnabled: false,
    })).toEqual(rows);
  });

  it("clamps pages and returns only the configured page size", () => {
    const many = Array.from({ length: 65 }, (_, index) =>
      entry({ key: `fish:${index}`, entryId: String(index), label: `물고기 ${index}` })
    );
    expect(paginateCodexMasteryEntries(many, 99)).toMatchObject({
      page: 3,
      pageCount: 3,
      total: 65,
    });
    expect(paginateCodexMasteryEntries(many, 99).entries).toHaveLength(5);
    expect(CODEX_MASTERY_PAGE_SIZE).toBe(30);
  });

  it("formats repository-supported comma fractional ISO timestamps", () => {
    expect(formatCodexMasteryDate("2026-08-20T00:00:00,123Z"))
      .not.toBe("기록 없음");
  });
});

describe("CodexMasteryPanel", () => {
  it.each([
    ["loading", "도감 숙련을 불러오는 중"],
    ["disabled", "도감 숙련 공개를 준비하고 있어요"],
  ] as const)("renders an opaque %s state", (status, message) => {
    const html = renderToStaticMarkup(
      <CodexMasteryPanel state={{ status }} onRetry={vi.fn()} onReplacePinnedGoals={vi.fn()} />,
    );
    expect(html).toContain(message);
    expect(html).toContain("bg-white");
    expect(html).toContain("dark:bg-zinc-900");
  });

  it("renders a retryable error state", () => {
    const html = renderToStaticMarkup(
      <CodexMasteryPanel
        state={{ status: "error", message: "network" }}
        onRetry={vi.fn()}
        onReplacePinnedGoals={vi.fn()}
      />,
    );
    expect(html).toContain("도감 숙련을 불러오지 못했어요");
    expect(html).toContain("다시 불러오기");
  });

  it("renders the overview, goals, filters, and first entry detail without fake future values", () => {
    const html = renderToStaticMarkup(
      <CodexMasteryPanel
        state={{ status: "ready", snapshot: snapshot() }}
        onRetry={vi.fn()}
        onReplacePinnedGoals={vi.fn()}
      />,
    );
    expect(html).toContain("종합 숙련 점수");
    expect(html).toContain("1,234");
    expect(html).toContain("발견 1/679");
    expect(html).toContain("장비 연구");
    expect(html).toContain("어류 연구");
    expect(html).toContain("고정 연구 목표");
    expect(html).toContain("최근 승급");
    expect(html).toContain("승급 임박 목표");
    expect(html).toContain("황금 잉어");
    expect(html).toContain("개인 최고 88.4");
    expect(html).toContain("금 · 10회");
    expect(html).toContain("특별 인장 1/2");
    expect(html).toContain("서버 랭킹 · 트로피 · 월간 연구전 기능은 다음 단계에서 연결됩니다");
    expect(html).not.toContain("서버 순위 0위");
  });

  it("shows a nonnumeric preparation state when monthly recording is enabled without a season", () => {
    const value = snapshot();
    value.features.monthlyProgressEnabled = true;
    value.monthlyResearch = { status: "no_season" };

    const html = renderToStaticMarkup(
      <CodexMasteryPanel
        state={{ status: "ready", snapshot: value }}
        onRetry={vi.fn()}
        onReplacePinnedGoals={vi.fn()}
      />,
    );

    expect(html).toContain("이번 달 월간 연구를 준비하고 있어요");
    expect(html).not.toContain("월간 연구전은 다음 단계에서 연결됩니다");
    expect(html).not.toContain("0 / 20,000");
    expect(html).toContain("bg-white");
    expect(html).toContain("dark:bg-zinc-900");
  });

  it("renders the active score composition and all 18 visible grouped goals", () => {
    const value = snapshot();
    value.features.monthlyProgressEnabled = true;
    value.monthlyResearch = activeMonthlyResearch();

    const html = renderToStaticMarkup(
      <CodexMasteryPanel
        state={{ status: "ready", snapshot: value }}
        onRetry={vi.fn()}
        onReplacePinnedGoals={vi.fn()}
      />,
    );

    expect(html).toContain("강과 호수의 달");
    expect(html).toContain("12,345 / 20,000");
    expect(html).toContain("연구 목표");
    expect(html).toContain("7,200");
    expect(html).toContain("다양성");
    expect(html).toContain("3,645");
    expect(html).toContain("기록");
    expect(html).toContain("1,500");
    expect(html).toContain("완료 7/18");
    expect(html).toContain("기초 조사");
    expect(html).toContain("분야 연구");
    expect(html).toContain("전문 연구");
    expect(html).toContain("도전 기록");
    expect(html.match(/data-research-objective=/g)).toHaveLength(18);
    expect(html).toContain("월간 목표 challenge-2");
    expect(html).not.toContain("잠정 순위");
    expect(html).not.toContain("예상 트로피");
    expect(html).not.toContain("시즌 정산");
    expect(html).not.toMatch(/(?:bg|dark:bg)-[^\s\"]+\/(?:20|40|70)/);
    expect(html).not.toMatch(/data-research-objective=[^>]+opacity-/);
  });

  it("bounds the rendered catalog rows to thirty", () => {
    const many = Array.from({ length: 35 }, (_, index) =>
      entry({
        key: `fish:${index}`,
        entryId: String(index),
        label: `물고기 ${index}`,
        pinned: false,
      })
    );
    const html = renderToStaticMarkup(
      <CodexMasteryPanel
        state={{ status: "ready", snapshot: snapshot(many) }}
        onRetry={vi.fn()}
        onReplacePinnedGoals={vi.fn()}
      />,
    );
    expect(html.match(/data-mastery-entry=/g)).toHaveLength(30);
    expect(html).toContain("1/2쪽");
  });
});
