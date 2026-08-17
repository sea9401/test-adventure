import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { newRareMapInstance } from "@/adventure/data/v2/rareMaps";
import { RareMapButton } from "./V2DungeonList";

describe("열린 희귀 탐사 카드", () => {
  it("남은 판수와 30분 제한 및 남은 시간을 함께 표시한다", () => {
    const map = newRareMapInstance("worn_map", 10, 1_000, "rm-open");
    const html = renderToStaticMarkup(
      <RareMapButton
        map={{ ...map, runsLeft: 4 }}
        serverNow={map.foundAt}
        frontierDepth={10}
        onSelect={vi.fn()}
        onDiscard={vi.fn()}
        discarding={false}
        onExpire={vi.fn()}
      />,
    );

    expect(html).toContain("남은 4판");
    expect(html).toContain("30분 동안 개방");
    expect(html).toContain("남은 시간 30:00");
  });
});
