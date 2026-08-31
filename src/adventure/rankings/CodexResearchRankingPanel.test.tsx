import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CodexResearchRankingPanel } from "./CodexResearchRankingPanel";

const row = {
  rank: 1,
  name: "연구가",
  avatar: "male1" as const,
  score: 19_000,
  objectiveCompletedCount: 18,
  objectiveScore: 12_000,
  diversityScore: 4_000,
  recordScore: 3_000,
  provisionalTier: "legendary" as const,
  mine: true,
  profileBorder: null,
  chatNameEffect: null,
};

describe("monthly codex ranking panel", () => {
  it("explains the unpublished and no-season states without fabricated scores", () => {
    const disabled = renderToStaticMarkup(
      <CodexResearchRankingPanel
        state={{ status: "disabled" }}
        onRetry={vi.fn()}
        onSelectName={vi.fn()}
      />,
    );
    const noSeason = renderToStaticMarkup(
      <CodexResearchRankingPanel
        state={{ status: "no_season" }}
        onRetry={vi.fn()}
        onSelectName={vi.fn()}
      />,
    );
    expect(disabled).toContain("월간 연구 랭킹은 아직 공개 전");
    expect(noSeason).toContain("준비 중인 월간 연구 시즌이 없습니다");
    expect(noSeason).not.toContain("0점");
  });

  it("renders theme, deadline, official components, and provisional tier", () => {
    const html = renderToStaticMarkup(
      <CodexResearchRankingPanel
        state={{
          status: "ready",
          data: {
            ok: true,
            enabled: true,
            status: "active",
            seasonId: "2026-08",
            themeId: "rivers-and-lakes",
            themeName: "강과 호수의 달",
            startAt: "2026-07-31T15:00:00.000Z",
            endAt: "2026-08-31T15:00:00.000Z",
            list: [row],
            nearby: [row],
            me: row,
          },
        }}
        onRetry={vi.fn()}
        onSelectName={vi.fn()}
      />,
    );
    expect(html).toContain("강과 호수의 달");
    expect(html).toContain("19,000점");
    expect(html).toContain("목표 12,000");
    expect(html).toContain("다양성 4,000");
    expect(html).toContain("기록 3,000");
    expect(html).toContain("전설 예상");
    expect(html).toContain("잠정 순위");
  });
});
