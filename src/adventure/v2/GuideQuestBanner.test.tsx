import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  CurrentGoalBanner,
  RepeatRewardBanner,
} from "./GuideQuestBanner";

describe("메인 반복 퀘스트 보상 알림", () => {
  const bundle = (
    scope: "daily" | "weekly",
    claimable: boolean,
    potions: number,
  ) => ({
    scope,
    completed: claimable ? 5 : 1,
    total: scope === "daily" ? 7 : 8,
    goal: scope === "daily" ? 4 : 5,
    potions,
    claimed: false,
    claimable,
  });

  it("받을 수 있는 일일·주간 보상과 포션 수량을 함께 보여준다", () => {
    const html = renderToStaticMarkup(
      <RepeatRewardBanner
        daily={bundle("daily", true, 2)}
        weekly={bundle("weekly", true, 5)}
        onOpen={vi.fn()}
      />,
    );

    expect(html).toContain("받을 수 있는 퀘스트 보상");
    expect(html).toContain("일일 보상");
    expect(html).toContain("스태미나 포션 2개");
    expect(html).toContain("주간 보상");
    expect(html).toContain("스태미나 포션 5개");
  });

  it("수령 가능한 반복 보상이 없으면 표시하지 않는다", () => {
    const html = renderToStaticMarkup(
      <RepeatRewardBanner
        daily={bundle("daily", false, 2)}
        weekly={bundle("weekly", false, 5)}
        onOpen={vi.fn()}
      />,
    );

    expect(html).toBe("");
  });
});

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
