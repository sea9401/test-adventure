import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CurrentGoalBanner } from "./GuideQuestBanner";

describe("메인 추적 퀘스트 카드", () => {
  it("추적 배지와 현재 진행 수치·진행 막대를 표시한다", () => {
    const html = renderToStaticMarkup(
      <CurrentGoalBanner
        tracked
        onOpen={vi.fn()}
        current={{
          id: "gold_100k",
          line: "collection",
          title: "두둑한 지갑",
          desc: "총 보유 골드 100,000 G를 달성하세요.",
          href: null,
          reward: {},
          status: "active",
          points: 20,
          progress: 42_000,
          goal: 100_000,
          detailKind: null,
        }}
      />,
    );

    expect(html).toContain("추적 중");
    expect(html).toContain("42,000 / 100,000");
    expect(html).toContain("width:42%");
  });
});
