import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GuildActivityList, type GuildActivity } from "./GuildActivityList";

describe("길드 시설 지원 물자 활동 로그", () => {
  it("지원 시설과 통나무·철광석 적용량을 표시한다", () => {
    const activity: GuildActivity = {
      id: 1,
      type: "trade_shop_purchase",
      actorName: "춘삼",
      targetName: null,
      meta: {
        itemName: "길드 시설 지원 물자",
        tokenCost: 120,
        remainingTokens: 380,
        facilitySupport: {
          buildingId: "guild_smithy",
          buildingName: "제작소",
          targetLevel: 2,
          crop: 100,
          ore: 100,
        },
      },
      createdAt: new Date().toISOString(),
    };

    const html = renderToStaticMarkup(
      <GuildActivityList activity={[activity]} />,
    );

    expect(html).toContain(
      "제작소 Lv.2에 통나무 100개·철광석 100개를 지원했어요",
    );
    expect(html).not.toContain("길드 공용 보상으로 적용했어요");
  });
});

describe("길드 전투보급 운용비 활동 로그", () => {
  it("새 운용 단계와 실제 길드 자금 지출을 표시한다", () => {
    const activity: GuildActivity = {
      id: 2,
      type: "combat_supply_funding",
      actorName: "무뭄",
      targetName: null,
      meta: { operationsTier: 2, goldCost: 50_000_000 },
      createdAt: new Date().toISOString(),
    };

    const html = renderToStaticMarkup(
      <GuildActivityList activity={[activity]} />,
    );

    expect(html).toContain(
      "무뭄 님이 주간 전투보급 운용을 Lv 2로 강화했어요 · 길드 자금 -50,000,000 G",
    );
  });
});

describe("반복 길드 활동 로그", () => {
  it("연속된 동일 활동을 횟수와 함께 한 줄로 표시한다", () => {
    const repeated = [1, 2, 3].map<GuildActivity>((id) => ({
      id,
      type: "workshop_craft_only",
      actorName: "플루디아",
      targetName: null,
      meta: { itemName: "오로라 관장식" },
      createdAt: new Date(2026, 8, 1, 19, 37, id).toISOString(),
    }));
    const different: GuildActivity = {
      id: 4,
      type: "member_join",
      actorName: null,
      targetName: "새길드원",
      meta: null,
      createdAt: new Date(2026, 8, 1, 19, 36).toISOString(),
    };

    const html = renderToStaticMarkup(
      <GuildActivityList activity={[...repeated, different]} />,
    );

    expect(html.match(/<li/g)).toHaveLength(2);
    expect(html).toContain(
      "플루디아 님이 오로라 관장식 제작에 성공했어요 · 3회",
    );
    expect(html).toContain("새길드원 님이 길드에 합류했어요");
  });
});
