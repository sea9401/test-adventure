import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ARENA_TABS, ArenaRulesHelp } from "./V2ArenaView";

describe("아레나 화면 골격", () => {
  it("탭을 도전·순위·전투 세팅·기록·상점 다섯 개로 둔다", () => {
    expect(ARENA_TABS.map((tab) => tab.label)).toEqual([
      "도전",
      "순위",
      "전투 세팅",
      "기록",
      "상점",
    ]);
  });

  it("도움말에 규칙과 주간 보상을 함께 보여 준다", () => {
    const html = renderToStaticMarkup(
      <ArenaRulesHelp tournamentDay={false} dailyMatchCount={3} />,
    );

    expect(html).toContain("실유저 랭크");
    expect(html).toContain("매치 후 10초");
    expect(html).toContain("오늘 3전 · 10전마다 비용 +1");
    expect(html).toContain("Elo K=32");
    expect(html).toContain("1,000 코인");
    expect(html).toContain("우편함 지급");
  });

  it("일요일에는 연습전 규칙으로 바꿔 보여 준다", () => {
    const html = renderToStaticMarkup(
      <ArenaRulesHelp tournamentDay dailyMatchCount={0} />,
    );

    expect(html).toContain("일요일 연습전 무료");
    expect(html).toContain("Elo 변동 없음");
    expect(html).toContain("일요일 연습전 보상 없음");
  });
});
