import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CodexMasteryRankingRow } from "@/adventure/data/v2/codexMasteryRanking";
import {
  CodexMasteryRankingPanel,
  CODEX_MASTERY_RANKING_SCOPE_LABELS,
} from "./CodexMasteryRankingPanel";

function rankingRow(rank: number, overrides: Partial<CodexMasteryRankingRow> = {}) {
  return {
    rank,
    name: `연구가${rank}`,
    avatar: "male1" as const,
    score: 10_000 - rank,
    totalScore: 20_000 - rank,
    categoryScores: {
      equipment: 100,
      fish: 200,
      monster: 300,
      cooking: 400,
      life: 500,
      job: 600,
    },
    stageCounts: {
      bronze: 20,
      silver: 15,
      gold: 10,
      platinum: 5,
      diamond: 3,
      legendary: 1,
    },
    goldOrHigherCount: 10,
    sealCount: 4,
    scoredCategoryCount: 6,
    mine: false,
    profileBorder: null,
    chatNameEffect: null,
    ...overrides,
  };
}

const readyState = {
  status: "ready" as const,
  data: {
    ok: true as const,
    enabled: true as const,
    scope: "overall" as const,
    list: Array.from({ length: 12 }, (_, index) => rankingRow(index + 1)),
    nearby: [
      rankingRow(50),
      rankingRow(51),
      rankingRow(52, { name: "내연구가", mine: true }),
      rankingRow(53),
      rankingRow(54),
    ],
    me: rankingRow(52, { name: "내연구가", mine: true }),
  },
};

describe("CodexMasteryRankingPanel", () => {
  it("defines the permanent overall and six category labels", () => {
    expect(CODEX_MASTERY_RANKING_SCOPE_LABELS).toEqual({
      overall: "종합 숙련",
      equipment: "장비 연구",
      fish: "어류 연구",
      monster: "생태 연구",
      cooking: "미식 연구",
      life: "현장 연구",
      job: "직업 연구",
    });
  });

  it.each([
    [{ status: "loading" as const }, "숙련 랭킹을 불러오는 중입니다"],
    [{ status: "disabled" as const }, "도감 숙련 랭킹은 아직 공개 전입니다"],
    [{ status: "error" as const, message: "실패" }, "다시 시도"],
  ])("renders the bounded %s state", (state, expected) => {
    const html = renderToStaticMarkup(
      <CodexMasteryRankingPanel
        scope="overall"
        state={state}
        onRetry={vi.fn()}
        onSelectName={vi.fn()}
      />,
    );
    expect(html).toContain(expected);
  });

  it("renders an empty positive-score ranking", () => {
    const html = renderToStaticMarkup(
      <CodexMasteryRankingPanel
        scope="fish"
        state={{
          status: "ready",
          data: {
            ok: true,
            enabled: true,
            scope: "fish",
            list: [],
            nearby: [],
            me: null,
          },
        }}
        onRetry={vi.fn()}
        onSelectName={vi.fn()}
      />,
    );
    expect(html).toContain("아직 어류 연구 점수를 얻은 모험가가 없습니다");
  });

  it("renders ten top rows, the five nearby ranks, tie-break facts, and full details", () => {
    const html = renderToStaticMarkup(
      <CodexMasteryRankingPanel
        scope="overall"
        state={readyState}
        onRetry={vi.fn()}
        onSelectName={vi.fn()}
      />,
    );

    expect((html.match(/상세 기록/g) ?? [])).toHaveLength(15);
    expect(html).toContain("내 주변 순위");
    expect(html).toContain("랭킹 새로고침");
    expect(html).toContain("52위");
    expect(html).toContain("내연구가");
    expect(html).toContain("금 이상 10");
    expect(html).toContain("특별 인장 4");
    expect(html).toContain("연구 분야 6/6");
    expect(html).toContain("장비 연구");
    expect(html).toContain("전설 1");
    expect(html).toContain("aria-current=\"true\"");
    expect(html).toContain("aria-label=\"2 페이지\"");
    expect(html).toContain("bg-white");
  });
});
