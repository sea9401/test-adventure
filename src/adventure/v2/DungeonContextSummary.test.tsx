import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DungeonContextSummary } from "./DungeonContextSummary";

describe("압축 던전 문맥", () => {
  it("한 카드에 장소·전투력·난이도·안정도를 모은다", () => {
    const html = renderToStaticMarkup(
      <DungeonContextSummary
        displayName="심해 폐허 · 입구"
        outpostName="항구 거점"
        challenge
        playerPower={1234}
        difficultyPower={1500}
        growthLabel="성장 구간"
        readiness={{ label: "조금 위험", tone: "warning" }}
        onBack={vi.fn()}
      />,
    );
    expect(html).toContain("심해 폐허 · 입구");
    expect(html).toContain("내 전투력");
    expect(html).toContain("1,234");
    expect(html).toContain("난이도 지표");
    expect(html).toContain("조금 위험");
    expect(html.match(/ui-game-card/g)).toHaveLength(1);
    expect(html).toContain("dark:bg-zinc-950");
  });
});
