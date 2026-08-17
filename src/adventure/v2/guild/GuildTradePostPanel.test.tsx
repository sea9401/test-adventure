import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { GuildFacilitySupportTarget } from "@/adventure/data/v2/guildTrade";
import { GuildFacilitySupportDialog } from "./GuildTradePostPanel";

const eligibleTarget: GuildFacilitySupportTarget = {
  buildingId: "guild_smithy",
  buildingName: "제작소",
  currentLevel: 1,
  targetLevel: 2,
  eligible: true,
  reason: null,
  crop: { current: 20, required: 500, grant: 100, after: 120 },
  ore: { current: 30, required: 500, grant: 100, after: 130 },
};

describe("길드 시설 지원 물자 대상 선택", () => {
  it("통나무와 철광석의 적용 전후 수량 및 토큰 비용을 표시한다", () => {
    const html = renderToStaticMarkup(
      <GuildFacilitySupportDialog
        targets={[eligibleTarget]}
        selectedFacilityId="guild_smithy"
        tokenCost={120}
        busy={false}
        onSelect={vi.fn()}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain("시설 지원 대상 선택");
    expect(html).toContain("제작소 Lv.1 → Lv.2");
    expect(html).toContain("통나무");
    expect(html).toContain("20 → 120 / 500");
    expect(html).toContain("철광석");
    expect(html).toContain("30 → 130 / 500");
    expect(html).toContain("공동 토큰 120개로 지원하기");
  });

  it("지원할 수 없는 시설은 이유와 함께 선택 불가로 표시한다", () => {
    const html = renderToStaticMarkup(
      <GuildFacilitySupportDialog
        targets={[
          {
            ...eligibleTarget,
            buildingId: "training_ground",
            buildingName: "훈련장",
            eligible: false,
            reason: "remaining_below_200",
            crop: { current: 450, required: 500, grant: 0, after: 450 },
            ore: { current: 400, required: 500, grant: 0, after: 400 },
          },
        ]}
        selectedFacilityId={null}
        tokenCost={120}
        busy={false}
        onSelect={vi.fn()}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(html).toContain("남은 통나무·철광석 요구량이 200개 미만입니다.");
    expect(html).toContain("disabled");
  });
});
