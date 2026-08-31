import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { REFERRAL_TUTORIAL_TASKS } from "@/adventure/data/v2/referralTutorial";
import { ReferralTutorialRoadmap } from "./ReferralTutorialRoadmap";

describe("ReferralTutorialRoadmap", () => {
  it("여섯 단계를 고정 순서의 모바일 세로 목록으로 표시한다", () => {
    const html = renderToStaticMarkup(
      <ReferralTutorialRoadmap
        tasks={REFERRAL_TUTORIAL_TASKS}
        signupRewarded
        completedTaskIds={["join_guild", "life_level_5"]}
        showActions
      />,
    );

    const titles = [
      "모험 시작",
      "더 깊은 사냥터로",
      "길드의 일원",
      "첫 생활 숙련",
      "심부 돌파",
      "생활의 기반",
    ];
    for (const [index, title] of titles.entries()) {
      expect(html).toContain(`${index + 1}`);
      if (index > 0) {
        expect(html.indexOf(titles[index - 1])).toBeLessThan(html.indexOf(title));
      }
    }
    expect(html).toContain("3/6 완료");
    expect(html).toContain("양쪽 회복약 2개");
    expect(html).toContain('href="/battle"');
    expect(html).toContain('href="/character/life"');
    expect(html).not.toContain('href="null"');
    expect(html).toContain("bg-zinc-50");
    expect(html).toContain("dark:bg-zinc-950");
  });

  it("과거 지급 방식을 별도 표시하지 않는다", () => {
    const html = renderToStaticMarkup(
      <ReferralTutorialRoadmap
        tasks={REFERRAL_TUTORIAL_TASKS}
        signupRewarded={false}
        completedTaskIds={[]}
        showActions={false}
      />,
    );

    expect(html).not.toContain("기존 지급분");
    expect(html).not.toContain("승계");
    expect(html).not.toMatch(/깊이 (6|12|18)(\D|$)/);
  });
});
