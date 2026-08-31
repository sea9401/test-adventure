import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CodexResearchArchivePanel } from "./CodexResearchArchivePanel";

const season = {
  seasonId: "2026-08",
  themeId: "rivers-and-lakes",
  themeName: "강과 호수의 달",
  startAt: "2026-07-31T15:00:00.000Z",
  endAt: "2026-08-31T15:00:00.000Z",
  settledAt: "2026-08-31T16:00:00.000Z",
  publishedAt: "2026-08-31T17:00:00.000Z",
  participantCount: 7,
  trophyCount: 6,
};
const row = {
  rank: 1,
  name: "수집왕",
  avatar: "male1" as const,
  score: 19_000,
  objectiveCompletedCount: 18,
  objectiveScore: 11_000,
  diversityScore: 5_000,
  recordScore: 3_000,
  finalTier: "legendary" as const,
  mine: true,
  profileBorder: null,
  chatNameEffect: null,
  firstPlaceEngraving: true,
};

describe("codex research archive panel", () => {
  it("renders disabled and empty states without invented ranks", () => {
    const disabled = renderToStaticMarkup(<CodexResearchArchivePanel
      state={{ status: "disabled" }} onRetry={vi.fn()} onSeasonChange={vi.fn()}
      onSelectName={vi.fn()} />);
    const empty = renderToStaticMarkup(<CodexResearchArchivePanel
      state={{ status: "no_season", seasons: [] }} onRetry={vi.fn()}
      onSeasonChange={vi.fn()} onSelectName={vi.fn()} />);
    expect(disabled).toContain("명예의 전당은 아직 공개 전");
    expect(empty).toContain("공개된 종료 시즌이 없습니다");
    expect(empty).not.toContain("0위");
  });

  it("renders immutable rank, tier, engraving, and opaque surface tokens", () => {
    const html = renderToStaticMarkup(<CodexResearchArchivePanel
      state={{
        status: "ready",
        data: { ok: true, enabled: true, status: "ready", seasons: [season], selectedSeasonId: "2026-08", list: [row], nearby: [row], me: row },
      }}
      onRetry={vi.fn()} onSeasonChange={vi.fn()} onSelectName={vi.fn()} />);
    expect(html).toContain("강과 호수의 달");
    expect(html).toContain("확정 1위");
    expect(html).toContain("전설 트로피");
    expect(html).toContain("초대 우승자 각인");
    expect(html).not.toContain("잠정");
    expect(html).toContain("bg-white");
    expect(html).toContain("dark:bg-zinc-900");
  });
});
