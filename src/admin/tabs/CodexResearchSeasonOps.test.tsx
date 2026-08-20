import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AdminProvider } from "../AdminContext";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock("../api", () => ({
  adminGet: mocks.get,
  adminPost: mocks.post,
}));

import {
  CodexResearchSeasonOps,
  parseCodexResearchDefinitionEditor,
} from "./CodexResearchSeasonOps";

const previewData = {
  ok: true as const,
  features: { settlementEnabled: false, trophiesEnabled: false },
  seasons: [
    {
      seasonId: "2026-08",
      themeId: "river",
      themeName: "강과 호수의 달",
      definitionVersion: 1,
      startAt: "2026-07-31T15:00:00.000Z",
      endAt: "2026-08-31T15:00:00.000Z",
      status: "closed" as const,
      settledAt: "2026-08-31T16:00:00.000Z",
      opsState: "inconsistent" as const,
      counts: {
        progress: 12,
        scored: 10,
        finalRanked: 0,
        finalTiers: {
          bronze: 0,
          silver: 0,
          gold: 0,
          platinum: 0,
          diamond: 0,
          legendary: 0,
        },
        trophies: 0,
      },
    },
  ],
  definitionPreview: {
    seasonId: "2026-09",
    themeId: "river",
    themeName: "강과 호수의 달",
    version: 1,
    startAt: "2026-08-31T15:00:00.000Z",
    endAt: "2026-09-30T15:00:00.000Z",
    primaryCategories: ["fish", "life"] as const,
    supportCategory: "cooking" as const,
    objectiveCount: 18,
    groupCounts: { basic: 6, field: 6, expert: 4, challenge: 2 },
    objectiveScore: 12_000,
    diversityScore: 5_000,
    recordScore: 3_000,
    schedulable: true,
  },
};

describe("도감 연구 시즌 운영 화면", () => {
  it("shows large opaque summaries, exact confirmations, and inconsistency warnings", () => {
    const html = renderToStaticMarkup(
      <AdminProvider>
        <CodexResearchSeasonOps previewData={previewData} />
      </AdminProvider>,
    );

    expect(html).toContain("도감 연구 시즌 운영");
    expect(html).toContain("목표 18개");
    expect(html).toContain("총 20,000점");
    expect(html).toContain("정합성 확인 필요");
    expect(html).toContain("SETTLE 2026-08");
    expect(html).toContain("RESETTLE 2026-08");
    expect(html).toContain("AWARD 2026-08");
    expect(html).toContain("SCHEDULE 2026-09");
    expect(html).toContain("bg-white");
    expect(html).toContain("dark:bg-zinc-900");
    expect(html).not.toMatch(/bg-(?:white|zinc-900)\//);
  });

  it("hides every mutation trigger in the default read-only mode", () => {
    const html = renderToStaticMarkup(
      <AdminProvider>
        <CodexResearchSeasonOps previewData={previewData} />
      </AdminProvider>,
    );

    expect(html).toContain("보기 전용 모드");
    expect(html).not.toContain(">예약 실행<");
    expect(html).not.toContain(">결산 실행<");
    expect(html).not.toContain(">재결산 실행<");
    expect(html).not.toContain(">트로피 발급<");
  });

  it("keeps malformed editor JSON local and never calls the admin API", () => {
    expect(parseCodexResearchDefinitionEditor("{"))
      .toEqual({ ok: false, error: "정의 JSON 문법을 확인해 주세요." });
    expect(parseCodexResearchDefinitionEditor("[]"))
      .toEqual({ ok: false, error: "정의 JSON은 객체여야 합니다." });
    expect(mocks.post).not.toHaveBeenCalled();
  });
});
