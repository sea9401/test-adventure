import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { GuildFacilitiesPanel } from "./GuildOutpostsPanel";

describe("길드 시설 카드 작업 위치", () => {
  it("시설 주요 버튼을 가변적인 업그레이드 영역보다 앞의 고정 요약 영역에 둔다", () => {
    const html = renderToStaticMarkup(
      <GuildFacilitiesPanel
        guildId={1}
        info={{
          settlementBuildings: { guild_smithy: 1 },
          settlementBuildingLevels: { guild_smithy: 1 },
          guildGold: 0,
        }}
        activeFacility={null}
        onFacilityChange={vi.fn()}
      />,
    );

    const primaryActionIndex = html.indexOf(">제작소 열기<");
    const upgradeFundIndex = html.indexOf("Lv 2 재료 기부");

    expect(html).toContain('aria-label="제작소 요약"');
    expect(html).toContain("min-h-[8rem]");
    expect(html).toContain("line-clamp-2");
    expect(primaryActionIndex).toBeGreaterThan(-1);
    expect(upgradeFundIndex).toBeGreaterThan(-1);
    expect(primaryActionIndex).toBeLessThan(upgradeFundIndex);
  });
});
