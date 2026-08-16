import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LifeMasterySummaryCard } from "./LifeMasterySummaryCard";
import { LifeActivityCard } from "./V2LifeRecordView";

describe("생활 기록 화면", () => {
  it("내 정보 요약에서 생활 기록 화면으로 이동할 수 있다", () => {
    const html = renderToStaticMarkup(
      <LifeMasterySummaryCard level={123} maxLevel={500} />,
    );

    expect(html).toContain("생활 기록");
    expect(html).toContain("123");
    expect(html).toContain('href="/character/life"');
    expect(html).toContain('aria-valuemax="500"');
  });

  it("생활 카드에 레벨·숙련도·누적 기록·효과·목표·바로가기를 표시한다", () => {
    const html = renderToStaticMarkup(
      <LifeActivityCard
        activity={{
          id: "woodcutting",
          level: 12,
          levelCap: 50,
          xp: 500,
          xpIntoLevel: 60,
          xpForNext: 120,
          records: [{ label: "총 벌목", value: 42, suffix: "회" }],
          effects: ["작업 시간 2.2% 단축"],
          nextGoal: "벌목 명인 생활 레벨 조건 · Lv.20",
        }}
      />,
    );

    expect(html).toContain("벌목");
    expect(html).toContain("Lv.12");
    expect(html).toContain("60 / 120 XP");
    expect(html).toContain("총 벌목");
    expect(html).toContain("42회");
    expect(html).toContain("현재 효과 · 작업 시간 2.2% 단축");
    expect(html).toContain("다음 목표 · 벌목 명인 생활 레벨 조건 · Lv.20");
    expect(html).toContain('href="/town/logging"');
  });

  it("100레벨 생활 카드는 최종 숙련 상태를 표시한다", () => {
    const html = renderToStaticMarkup(
      <LifeActivityCard
        activity={{
          id: "farming",
          level: 100,
          levelCap: 100,
          xp: 120_050,
          xpIntoLevel: 0,
          xpForNext: 0,
          records: [],
          effects: [],
          nextGoal: null,
        }}
      />,
    );

    expect(html).toContain("Lv.100");
    expect(html).toContain("/ 100");
    expect(html).toContain("최종 숙련 달성 · MAX");
    expect(html).toContain('aria-valuenow="100"');
  });
});
