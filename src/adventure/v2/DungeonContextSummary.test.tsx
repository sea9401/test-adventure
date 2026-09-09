import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DungeonContextSummary } from "./DungeonContextSummary";

describe("압축 던전 문맥", () => {
  it("장소와 성장 정보를 표시하고 스탯 기반 난이도는 표시하지 않는다", () => {
    const html = renderToStaticMarkup(
      <DungeonContextSummary
        displayName="심해 폐허 · 입구"
        outpostName="항구 거점"
        challenge
        growthLabel="성장 구간"
        readiness={{ label: "조금 위험", tone: "warning" }}
        onBack={vi.fn()}
      />,
    );
    expect(html).toContain("심해 폐허 · 입구");
    expect(html).not.toContain("전투력");
    expect(html).not.toContain("스탯 합계");
    expect(html).not.toContain("1,234");
    expect(html).not.toContain("난이도 지표");
    expect(html).toContain("조금 위험");
    expect(html.match(/ui-game-card/g)).toHaveLength(1);
    expect(html).toContain("dark:bg-zinc-950");
  });
});
