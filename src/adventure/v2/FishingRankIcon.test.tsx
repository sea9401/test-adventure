import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FishingRankIcon, fishingRankIconName } from "./FishingRankIcon";

describe("낚시 순위 아이콘", () => {
  it("1~3위를 금·은·동 자체 아이콘으로 표시한다", () => {
    expect(fishingRankIconName(1)).toBe("rank_gold");
    expect(fishingRankIconName(2)).toBe("rank_silver");
    expect(fishingRankIconName(3)).toBe("rank_bronze");
    expect(fishingRankIconName(4)).toBeNull();

    const html = renderToStaticMarkup(<FishingRankIcon rank={2} />);
    expect(html).toContain('data-plump-icon="rank_silver"');
    expect(html).not.toContain("🥈");
  });

  it("4위부터는 기존 순위 텍스트를 유지한다", () => {
    expect(renderToStaticMarkup(<FishingRankIcon rank={4} />)).toContain("4위");
  });
});
